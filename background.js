var CAPTURE_GAP = 560;
var running = false;
var offscreenReady = false;
var logBuffer = [];
var drawnFrames = [];
var drawnBytes = 0;
var replayComplete = true;
var MAX_REPLAY_BYTES = 40 * 1024 * 1024;
var activeTabId = null;
var overlaysApplied = false;

function log(step, data) {
  var entry = { t: Date.now(), step: step, data: data === undefined ? null : data };
  logBuffer.push(entry);
  if (logBuffer.length > 400) logBuffer.shift();
  try {
    console.log('[SC] ' + step, data === undefined ? '' : data);
  } catch (e) {}
}

function persistLog() {
  try {
    chrome.storage.local.set({ scLog: logBuffer });
  } catch (e) {}
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function withTimeout(promise, ms, label) {
  var timer;
  var timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () { reject(new Error(label + ' 超时 ' + ms + 'ms')); }, ms);
  });
  return Promise.race([promise, timeout]).finally(function () { clearTimeout(timer); });
}

async function setBadge(text, color) {
  try {
    if (color) await chrome.action.setBadgeBackgroundColor({ color: color });
    await chrome.action.setBadgeText({ text: text || '' });
  } catch (e) {}
}

async function ensureOffscreen() {
  if (offscreenReady) return;
  if (!chrome.offscreen) throw new Error('当前 Chrome 不支持 offscreen API');
  var exists = await chrome.offscreen.hasDocument();
  log('offscreen-exists', exists);
  if (!exists) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: '使用 canvas 拼接多屏滚动截图'
    });
    log('offscreen-created');
  }
  offscreenReady = true;
  await sleep(120);
}

async function toOffscreen(msg, timeoutMs, retries) {
  var payload = Object.assign({ target: 'offscreen' }, msg);
  var lastErr = null;
  var tries = retries || 4;
  for (var i = 0; i < tries; i++) {
    try {
      var r = await withTimeout(
        chrome.runtime.sendMessage(payload),
        timeoutMs || 5000,
        'offscreen:' + msg.type
      );
      if (r) return r;
    } catch (e) {
      lastErr = e;
      log('offscreen-retry', { type: msg.type, attempt: i, error: e.message });
    }
    await sleep(120);
  }
  throw new Error('offscreen 无响应(' + msg.type + '): ' + (lastErr ? lastErr.message : 'unknown'));
}

async function toTab(tabId, msg, timeoutMs) {
  var payload = Object.assign({ target: 'content' }, msg);
  return withTimeout(chrome.tabs.sendMessage(tabId, payload), timeoutMs || 4000, 'tab:' + msg.type);
}

async function reinitOffscreen(desc) {
  try {
    await chrome.offscreen.closeDocument();
  } catch (e) {}
  offscreenReady = false;
  await ensureOffscreen();
  await toOffscreen({ type: 'SC_INIT', desc: desc }, 8000, 3);
}

async function replayAll(desc) {
  for (var i = 0; i < drawnFrames.length; i++) {
    var f = drawnFrames[i];
    await toOffscreen({
      type: 'SC_FRAME',
      dataUrl: f.dataUrl,
      scrollTop: f.scrollTop,
      rect: desc.rect,
      step: f.step
    }, 15000, 1);
  }
}

async function drawFrame(desc, dataUrl, scrollTop, step) {
  var res = null;
  try {
    res = await toOffscreen({
      type: 'SC_FRAME',
      dataUrl: dataUrl,
      scrollTop: scrollTop,
      rect: desc.rect,
      step: step
    }, 15000, 1);
  } catch (e) {
    log('frame-timeout', { error: e.message });
  }

  if (res && res.ok) return res;

  if (!replayComplete) {
    throw new Error('离屏文档异常，且帧缓存超限，无法安全重建');
  }

  log('rebuild-offscreen', { reason: (res && res.error) || 'timeout', replay: drawnFrames.length });
  await reinitOffscreen(desc);
  await replayAll(desc);

  res = await toOffscreen({
    type: 'SC_FRAME',
    dataUrl: dataUrl,
    scrollTop: scrollTop,
    rect: desc.rect,
    step: step
  }, 15000, 1);

  if (!res || res.ok === false) {
    throw new Error('帧拼接失败(重建后): ' + (res && res.error));
  }
  return res;
}

async function runCapture() {
  if (running) {
    log('skip-already-running');
    return;
  }
  running = true;
  logBuffer = [];
  drawnFrames = [];
  drawnBytes = 0;
  replayComplete = true;
  overlaysApplied = false;
  activeTabId = null;
  log('start');
  await setBadge('…', '#2f6fed');

  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs && tabs[0];
    log('active-tab', tab ? { id: tab.id, windowId: tab.windowId, url: tab.url } : null);
    if (!tab || !tab.id) throw new Error('没有活动标签页');
    if (/^(chrome|edge|about|chrome-extension|devtools|view-source):/.test(tab.url || '')) {
      throw new Error('此页面类型不允许注入脚本：' + tab.url);
    }
    activeTabId = tab.id;

    try {
      await chrome.windows.update(tab.windowId, { focused: true });
      log('window-focused');
      var w = await chrome.windows.get(tab.windowId);
      var t = await chrome.tabs.get(tab.id);
      log('window-state', { focused: w.focused, state: w.state });
      log('tab-state', { active: t.active, status: t.status, discarded: t.discarded });
    } catch (e) {
      log('window-focus-failed', e.message);
    }

    await ensureOffscreen();
    log('injecting');

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lib/detect.js', 'content.js']
      });
    } catch (e) {
      throw new Error('注入脚本失败（若目标是 file:// 页面，需在扩展详情里开启“允许访问文件网址”）：' + e.message);
    }
    log('injected');

    var desc = await toTab(tab.id, { type: 'SC_DETECT' });
    log('detected', desc ? {
      mode: desc.mode,
      rect: desc.rect,
      scrollHeight: desc.scrollHeight,
      clientHeight: desc.clientHeight,
      confidence: desc.confidence
    } : null);
    if (!desc) throw new Error('没找到可滚动的区域（可能目标在跨域 iframe 内，或页面本身不滚动）');

    var initRes = await toOffscreen({ type: 'SC_INIT', desc: desc }, 8000, 3);
    log('canvas-init', initRes);

    var prepRes = await toTab(tab.id, { type: 'SC_PREP', rect: desc.rect });
    overlaysApplied = true;
    log('overlays-handled', prepRes);

    var settle = await toTab(tab.id, { type: 'SC_SETTLE_TOP', capMs: 6000 }, 10000);
    log('settled-top', settle);
    if (settle && settle.scrollHeight && Math.abs(settle.scrollHeight - desc.scrollHeight) > 16) {
      desc.scrollHeight = settle.scrollHeight;
      await toOffscreen({ type: 'SC_INIT', desc: desc }, 8000, 3);
      log('canvas-reinit', { scrollHeight: desc.scrollHeight });
    }

    var step = Math.max(1, Math.floor(Math.min(desc.clientHeight, desc.rect.height) * 0.8));
    var total = desc.scrollHeight;
    var y = 0;
    var guard = 0;
    var lastActual = -1;

    while (guard < 500) {
      log('frame-begin', { i: guard, requestedY: y, total: total });

      var scrolled = await toTab(tab.id, { type: 'SC_SCROLL', y: y });
      log('scrolled', { actualY: scrolled.scrollTop, scrollHeight: scrolled.scrollHeight });
      await sleep(160);
      await setBadge(String(guard + 1), '#2f6fed');

      var curH = scrolled.scrollHeight || total;
      if (curH > total + 8) {
        log('content-grew', { from: total, to: curH });
        total = curH;
        desc.scrollHeight = curH;
        if (replayComplete) {
          await reinitOffscreen(desc);
          await replayAll(desc);
          log('canvas-reinit', { scrollHeight: curH, replayed: drawnFrames.length });
        }
      }

      log('capture-begin', { windowId: tab.windowId });
      var dataUrl;
      try {
        dataUrl = await withTimeout(
          chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }),
          6000,
          'captureVisibleTab'
        );
      } catch (e) {
        throw new Error('captureVisibleTab 失败：' + e.message);
      }
      log('capture-done', { bytes: dataUrl ? dataUrl.length : 0 });

      log('draw-begin', { i: guard });
      var frameRes = await drawFrame(desc, dataUrl, scrolled.scrollTop, step);
      log('draw-done', { ok: frameRes && frameRes.ok, drift: frameRes && frameRes.drift, error: frameRes && frameRes.error });

      if (drawnBytes + dataUrl.length <= MAX_REPLAY_BYTES) {
        drawnFrames.push({ scrollTop: scrolled.scrollTop, dataUrl: dataUrl, step: step });
        drawnBytes += dataUrl.length;
      } else {
        replayComplete = false;
      }

      var actual = scrolled.scrollTop;
      if (actual + desc.clientHeight >= total - 1) break;
      if (actual <= lastActual) {
        log('scroll-stuck', { actual: actual, lastActual: lastActual });
        break;
      }
      lastActual = actual;
      y = actual + step;
      guard++;
      await sleep(CAPTURE_GAP);
    }

    await toTab(tab.id, { type: 'SC_RESTORE', y: desc.startScrollTop });

    var out = await toOffscreen({ type: 'SC_FINISH' }, 40000, 2);
    if (!out || !out.dataUrl) throw new Error('导出失败');
    log('done', { frames: guard + 1, w: out.w, h: out.h });

    await chrome.storage.local.set({
      lastCapture: out.dataUrl,
      lastCaptureAt: Date.now(),
      lastError: null,
      lastMeta: { mode: desc.mode, confidence: desc.confidence, frames: guard + 1, w: out.w, h: out.h }
    });
    persistLog();
    await setBadge('', null);
    await chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });

    try {
      await chrome.downloads.download({
        url: out.dataUrl,
        filename: 'scroll-capture-' + Date.now() + '.png'
      });
    } catch (e) {
      log('download-failed', e.message);
    }
  } catch (e) {
    var msg = String((e && e.message) || e);
    log('error', { message: msg, stack: e && e.stack });
    persistLog();
    try {
      await chrome.storage.local.set({ lastError: msg });
    } catch (err) {}
    await setBadge('!', '#c0392b');
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html?error=1') });
    } catch (err) {}
  } finally {
    if (overlaysApplied && activeTabId) {
      try {
        await toTab(activeTabId, { type: 'SC_RESTORE_OVERLAYS' });
      } catch (e) {}
    }
    overlaysApplied = false;
    running = false;
  }
}

log('sw-loaded');

chrome.runtime.onInstalled.addListener(function () {
  log('installed');
});

chrome.commands.onCommand.addListener(function (cmd) {
  log('command', cmd);
  if (cmd === 'capture-scroll') runCapture();
});

chrome.action.onClicked.addListener(function () {
  log('action-clicked');
  runCapture();
});
