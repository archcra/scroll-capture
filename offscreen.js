var canvas = null;
var ctx = null;
var scale = 1;
var outW = 0;
var outH = 0;
var rect = null;
var viewport = null;

function withTimeout(promise, ms, label) {
  var timer;
  var timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () { reject(new Error(label + ' 超时 ' + ms + 'ms')); }, ms);
  });
  return Promise.race([promise, timeout]).finally(function () { clearTimeout(timer); });
}

function init(msg) {
  var desc = msg.desc;
  rect = desc.rect;
  viewport = desc.viewport;
  var size = SCStitch.outputSize({
    rect: rect,
    scrollHeight: desc.scrollHeight,
    dpr: desc.dpr || 1,
    max: 16000
  });
  scale = size.scale;
  outW = size.width;
  outH = size.height;
  canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);
}

function loadImage(dataUrl) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    var timer = setTimeout(function () { reject(new Error('Image.onload 超时')); }, 8000);
    img.onload = function () { clearTimeout(timer); resolve(img); };
    img.onerror = function () { clearTimeout(timer); reject(new Error('Image.onerror')); };
    img.src = dataUrl;
  });
}

async function loadBitmap(dataUrl) {
  if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
    try {
      var resp = await withTimeout(fetch(dataUrl), 5000, 'fetch');
      var blob = await withTimeout(resp.blob(), 5000, 'blob');
      return await withTimeout(createImageBitmap(blob), 5000, 'createImageBitmap');
    } catch (e) {}
  }
  return loadImage(dataUrl);
}

async function frame(msg) {
  var bmp = await loadBitmap(msg.dataUrl);
  var w = bmp.width || bmp.naturalWidth;
  var h = bmp.height || bmp.naturalHeight;
  var p = SCStitch.placement({
    rect: rect,
    viewport: viewport,
    scale: scale,
    imgW: w,
    imgH: h,
    scrollTop: msg.scrollTop
  });
  if (p.sw > 0 && p.sh > 0) {
    ctx.drawImage(bmp, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
  }
  if (typeof bmp.close === 'function') bmp.close();
}

function watchdogMs(type) {
  if (type === 'SC_FINISH') return 30000;
  if (type === 'SC_INIT') return 10000;
  return 12000;
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.target !== 'offscreen') return;

  var responded = false;
  var timer = null;

  function reply(obj) {
    if (responded) return;
    responded = true;
    if (timer) clearTimeout(timer);
    try { sendResponse(obj); } catch (e) {}
  }

  timer = setTimeout(function () {
    reply({ ok: false, error: 'offscreen 处理超时（watchdog ' + watchdogMs(msg.type) + 'ms）', stage: msg.type });
  }, watchdogMs(msg.type));

  (async function () {
    try {
      if (msg.type === 'SC_INIT') {
        init(msg);
        reply({ ok: true, w: outW, h: outH });
      } else if (msg.type === 'SC_FRAME') {
        await frame(msg);
        reply({ ok: true });
      } else if (msg.type === 'SC_FINISH') {
        reply({ ok: true, dataUrl: canvas.toDataURL('image/png'), w: outW, h: outH });
      } else {
        reply({ ok: false, error: '未知消息类型: ' + msg.type });
      }
    } catch (e) {
      reply({ ok: false, error: String(e), stage: msg.type });
    }
  })();

  return true;
});
