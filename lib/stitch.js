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

  function bestOffset(o) {
    var probe = o.probe;
    var ref = o.ref;
    var base = o.base;
    var stepBy = o.step || 2;
    var range = o.range || 80;
    function costAt(dy) {
      var cost = 0;
      var n = 0;
      for (var j = 0; j < probe.length; j += 2) {
        var ri = dy + j - base;
        if (ri < 0 || ri >= ref.length) continue;
        cost += Math.abs(ref[ri] - probe[j]);
        n++;
      }
      return n ? cost / n : Infinity;
    }
    var expectedCost = costAt(o.expected);
    var bestDy = o.expected;
    var bestCost = expectedCost;
    for (var k = stepBy; k <= range; k += stepBy) {
      var opts = [o.expected + k, o.expected - k];
      for (var q = 0; q < 2; q++) {
        var c = costAt(opts[q]);
        if (c < bestCost - 0.25) {
          bestCost = c;
          bestDy = opts[q];
        }
      }
    }
    return { dy: bestDy, cost: bestCost, expectedCost: expectedCost };
  }

  g.SCStitch = { outputSize: outputSize, placement: placement, bestOffset: bestOffset };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.SCStitch;
})(typeof window !== 'undefined' ? window : globalThis);
