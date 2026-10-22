var canvas = null;
var ctx = null;
var scale = 1;
var outW = 0;
var outH = 0;
var rect = null;
var viewport = null;
var lastDy = null;

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
  lastDy = null;
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

function stripProfile(src, sx, sy, sw, sh, outH) {
  var probeW = 96;
  var c = document.createElement('canvas');
  c.width = probeW;
  c.height = outH;
  var cx = c.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#ffffff';
  cx.fillRect(0, 0, probeW, outH);
  if (sw > 0 && sh > 0) cx.drawImage(src, sx, sy, sw, sh, 0, 0, probeW, outH);
  var d = cx.getImageData(0, 0, probeW, outH).data;
  var rows = new Array(outH);
  for (var y = 0; y < outH; y++) {
    var s = 0;
    for (var x = 0; x < probeW; x++) {
      var i = (y * probeW + x) * 4;
      s += (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    }
    rows[y] = s / probeW;
  }
  return rows;
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
    var dy = p.dy;
    var drift = 0;
    var frameH = p.dh;
    var stepOut = (msg.step ? msg.step : 0) * scale;

    if (lastDy !== null && stepOut > 0 && frameH > stepOut + 8) {
      var expectedDy = lastDy + stepOut;
      var probeH = Math.max(8, Math.floor(frameH - stepOut - 4));
      var range = Math.min(Math.floor(stepOut * 0.35), 240);
      range = Math.max(0, Math.min(range, Math.floor(outH - expectedDy - probeH), expectedDy));
      if (range >= 4) {
        var ref = stripProfile(canvas, 0, expectedDy - range, outW, range * 2 + probeH, range * 2 + probeH);
        var probeImgH = Math.round(probeH * (p.sh / frameH));
        var probe = stripProfile(bmp, p.sx, p.sy, p.sw, probeImgH, probeH);
        var best = SCStitch.bestOffset({
          expected: expectedDy,
          range: range,
          step: 2,
          ref: ref,
          probe: probe,
          base: expectedDy - range
        });
        dy = best.dy;
        drift = dy - expectedDy;
      }
    }

    ctx.drawImage(bmp, p.sx, p.sy, p.sw, p.sh, p.dx, dy, p.dw, p.dh);
    lastDy = dy;
    if (typeof bmp.close === 'function') bmp.close();
    return { drift: drift };
  }
  if (typeof bmp.close === 'function') bmp.close();
  return { drift: 0 };
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
        var fr = await frame(msg);
        reply({ ok: true, drift: fr.drift });
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
