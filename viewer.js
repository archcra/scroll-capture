(async function () {
  var stored = await chrome.storage.local.get(['lastCapture', 'lastCaptureAt', 'lastMeta', 'lastError', 'scLog']);
  var img = document.getElementById('img');
  var empty = document.getElementById('empty');
  var sizeEl = document.getElementById('size');
  var banner = document.getElementById('banner');
  var logEl = document.getElementById('log');
  var dataUrl = stored.lastCapture;

  var logs = stored.scLog || [];
  if (logs.length) {
    logEl.textContent = logs.map(function (e) {
      var d = e.data ? ' ' + JSON.stringify(e.data) : '';
      return new Date(e.t).toLocaleTimeString() + '  ' + e.step + d;
    }).join('\n');
  } else {
    logEl.textContent = '（暂无日志）';
  }

  if (stored.lastError) {
    banner.style.display = 'block';
    banner.textContent = '这次截图失败：\n' + stored.lastError + '\n\n详细步骤见下方「运行日志」。';
    document.getElementById('logbox').open = true;
  }

  if (!dataUrl) {
    empty.style.display = 'block';
    img.style.display = 'none';
    if (!stored.lastError) logEl.parentElement.open = true;
    return;
  }

  img.src = dataUrl;
  img.onload = function () {
    var m = stored.lastMeta || {};
    sizeEl.textContent = img.naturalWidth + ' × ' + img.naturalHeight + ' px · ' +
      (m.mode === 'container' ? '右侧容器' : m.mode === 'document' ? '整页滚动' : '') +
      (m.confidence ? ' · 置信 ' + m.confidence : '') +
      (m.frames ? ' · ' + m.frames + ' 帧' : '');
  };

  document.getElementById('dl').addEventListener('click', function () {
    var a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'scroll-capture-' + Date.now() + '.png';
    a.click();
  });
})();
