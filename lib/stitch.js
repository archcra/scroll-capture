(function (g) {
  if (g.SCStitch) return;

  function outputSize(o) {
    var s = o.dpr || 1;
    var max = o.max || 16000;
    if (o.scrollHeight * s > max) s = max / o.scrollHeight;
    return {
      scale: s,
      width: Math.max(1, Math.round(o.rect.width * s)),
      height: Math.max(1, Math.round(o.scrollHeight * s))
    };
  }

  function placement(o) {
    var rect = o.rect;
    var viewport = o.viewport;
    var scale = o.scale;
    var imgScale = o.imgW / viewport.w;
    var sx = Math.max(0, rect.left * imgScale);
    var sy = Math.max(0, rect.top * imgScale);
    var sw = Math.max(0, Math.min(o.imgW - sx, rect.width * imgScale));
    var sh = Math.max(0, Math.min(o.imgH - sy, rect.height * imgScale));
    return {
      sx: sx,
      sy: sy,
      sw: sw,
      sh: sh,
      dx: 0,
      dy: Math.round(o.scrollTop * scale),
      dw: rect.width * scale,
      dh: rect.height * scale
    };
  }

  g.SCStitch = { outputSize: outputSize, placement: placement };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.SCStitch;
})(typeof window !== 'undefined' ? window : globalThis);
