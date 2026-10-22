// End-to-end test of an extension build: load unpacked, then exercise
// SC_INIT + SC_FRAME from the SERVICE WORKER (same path as production).
//
// 用法:  node test/offscreen-cdp-test.js <扩展目录> [调试端口]
//   例:  node test/offscreen-cdp-test.js . 9477
//
// 它做了什么:
//   1. 起一个干净的 Chrome（headless），用 CDP Extensions.loadUnpacked 装扩展
//      （Chrome 137+ 的正式版已禁用 --load-extension，只能用这个方式）
//   2. 打开扩展页 → 让 service worker 跑起来
//   3. 造一张 2864x1440 的 PNG（约 5.7MB data URL），从 SW 调 ensureOffscreen()
//      → toOffscreen(SC_INIT) → toOffscreen(SC_FRAME) x2，打印每一步耗时
//
// 输出示例（通过）:
//   RESULT: {"init":{"ok":true,"w":2864,"h":13636},"initMs":160,
//            "frame":{"ok":true},"frameMs":66,"frame2":{"ok":true},"frame2Ms":66}
//
// 注意: 这台机器能跑通，不等于操作员那台能跑通（offline/GPU/内存都会不同）。
//       它验证的是「代码路径本身成不成立」，不是「线上环境一定不卡」。
// 作者: 鲸鲸 (小鲸鱼)
const { spawn } = require('child_process');
const fs = require('fs');

const EXT = process.argv[2];
const PORT = parseInt(process.argv[3] || '9477', 10);
const PROFILE = '/private/tmp/sc-run-profile-' + PORT;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

fs.rmSync(PROFILE, { recursive: true, force: true });
const child = spawn(CHROME, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-crash-reporter',
  '--disable-breakpad',
  '--enable-unsafe-extension-debugging',
  '--user-data-dir=' + PROFILE,
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-port=' + PORT,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let err = '';
child.stderr.on('data', (d) => { err += d.toString(); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(wsUrl) { this.id = 0; this.pending = new Map(); this.events = []; this.wsUrl = wsUrl; }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res);
      this.ws.addEventListener('error', rej);
    });
    this.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
      } else if (m.method === 'Runtime.consoleAPICalled') {
        this.events.push((m.params.args || []).map((a) => a.value !== undefined ? a.value : a.description).join(' '));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      return 'EXC: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text);
    }
    return r.result && r.result.value;
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

async function waitDevtools() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch (e) {}
    await sleep(250);
  }
  throw new Error('devtools not ready');
}

async function main() {
  await waitDevtools();

  // 1) install the unpacked extension via CDP
  const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const browser = new CDP(v.webSocketDebuggerUrl);
  await browser.connect();
  const install = await browser.send('Extensions.loadUnpacked', { path: EXT });
  const extId = install.id;
  console.log('extension id:', extId);
  browser.close();

  // 2) open the extension page (starts the SW)
  const pageUrl = `chrome-extension://${extId}/viewer.html`;
  const created = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(pageUrl)}`, { method: 'PUT' })).json();
  await sleep(800);

  const page = new CDP(created.webSocketDebuggerUrl);
  await page.connect();
  await page.send('Runtime.enable');

  const prep = await page.eval(`(async () => {
    const c = document.createElement('canvas');
    c.width = 2864; c.height = 1440;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 2864, 1440);
    g.addColorStop(0, '#123'); g.addColorStop(1, '#fed');
    x.fillStyle = g; x.fillRect(0, 0, 2864, 1440);
    for (let i = 0; i < 400; i++) {
      x.fillStyle = 'rgba(' + (i * 37 % 255) + ',' + (i * 91 % 255) + ',' + (i * 13 % 255) + ',0.8)';
      x.fillRect((i * 97) % 2864, (i * 53) % 1440, 60, 24);
    }
    const dataUrl = c.toDataURL('image/png');
    await chrome.storage.local.set({ scPayload: dataUrl });
    return JSON.stringify({ len: dataUrl.length });
  })()`);
  console.log('payload:', prep);
  page.close();

  // 3) drive the real path from the service worker
  await sleep(500);
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const swT = targets.find((t) => t.type === 'service_worker' && t.url.includes(extId));
  if (!swT) throw new Error('service worker not found; targets=' + targets.map((t) => t.type + ':' + t.url).join(','));

  const sw = new CDP(swT.webSocketDebuggerUrl);
  await sw.connect();
  await sw.send('Runtime.enable');

  const out = await sw.eval(`(async () => {
    const res = {};
    try {
      const s = await chrome.storage.local.get('scPayload');
      const rect = { left: 296, top: 77, width: 1432, height: 720 };
      const desc = { rect, viewport: { w: 1432, h: 720 }, scrollHeight: 6818, dpr: 2 };
      let t = performance.now();
      await ensureOffscreen();
      res.init = await toOffscreen({ type: 'SC_INIT', desc });
      res.initMs = Math.round(performance.now() - t);
      t = performance.now();
      try {
        res.frame = await toOffscreen({ type: 'SC_FRAME', dataUrl: s.scPayload, scrollTop: 0, rect });
      } catch (e) { res.frameErr = e.message; }
      res.frameMs = Math.round(performance.now() - t);
      t = performance.now();
      try {
        res.frame2 = await toOffscreen({ type: 'SC_FRAME', dataUrl: s.scPayload, scrollTop: 720, rect });
      } catch (e) { res.frame2Err = e.message; }
      res.frame2Ms = Math.round(performance.now() - t);
    } catch (e) { res.error = String(e && e.message || e); }
    return JSON.stringify(res);
  })()`);

  console.log('RESULT:', out);
  const logs = sw.events.filter((e) => /SC-offscreen|SC_FRAME|offscreen/.test(e));
  if (logs.length) console.log('SW console:', logs.slice(-15).join('\n'));
  sw.close();
}

main()
  .catch((e) => { console.error('FAIL:', e && e.message); console.error(err.split('\n').slice(-6).join('\n')); })
  .finally(() => { try { child.kill('SIGKILL'); } catch (e) {} });
