var assert = require('assert');
var S = require('../lib/stitch.js');

(function documentMode() {
  var p = S.placement({
    rect: { left: 240, top: 0, width: 760, height: 700 },
    viewport: { w: 1000, h: 700 },
    scale: 2,
    imgW: 2000,
    imgH: 1400,
    scrollTop: 1400
  });
  assert.strictEqual(p.sx, 480);
  assert.strictEqual(p.sy, 0);
  assert.strictEqual(p.sw, 1520);
  assert.strictEqual(p.sh, 1400);
  assert.strictEqual(p.dy, 2800);
  assert.strictEqual(p.dw, 1520);
  assert.strictEqual(p.dh, 1400);
  console.log('ok - document mode placement');
})();

(function containerMode() {
  var p = S.placement({
    rect: { left: 240, top: 60, width: 1000, height: 600 },
    viewport: { w: 1400, h: 800 },
    scale: 2,
    imgW: 2800,
    imgH: 1600,
    scrollTop: 600
  });
  assert.strictEqual(p.sx, 480);
  assert.strictEqual(p.sy, 120);
  assert.strictEqual(p.sw, 2000);
  assert.strictEqual(p.sh, 1200);
  assert.strictEqual(p.dy, 1200);
  console.log('ok - container mode placement');
})();

(function clampTallPage() {
  var size = S.outputSize({
    rect: { width: 800, height: 700 },
    scrollHeight: 20000,
    dpr: 2,
    max: 16000
  });
  assert.ok(size.height <= 16000, 'height clamped');
  assert.strictEqual(Math.round(size.height), 16000);
  assert.ok(size.scale < 2, 'scale reduced');
  console.log('ok - tall page scale clamp');
})();

(function noUpscale() {
  var size = S.outputSize({ rect: { width: 800, height: 700 }, scrollHeight: 2000, dpr: 2, max: 16000 });
  assert.strictEqual(size.scale, 2);
  assert.strictEqual(size.width, 1600);
  assert.strictEqual(size.height, 4000);
  console.log('ok - normal scale');
})();

(function alignDetectsDrift() {
  var seed = 42;
  function rnd() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }
  var expected = 1000;
  var range = 240;
  var probeLen = 120;
  var raw = [];
  for (var y = 0; y < range * 2 + probeLen; y++) raw.push(150 + 80 * rnd());
  var ref = [];
  for (var k = 0; k < raw.length; k++) {
    var a = raw[Math.max(0, k - 1)], b = raw[k], c = raw[Math.min(raw.length - 1, k + 1)];
    ref.push((a + b + c) / 3);
  }
  var probe = [];
  for (var j = 0; j < probeLen; j++) probe.push(ref[expected + 40 - (expected - range) + j]);
  var best = S.bestOffset({ expected: expected, range: range, step: 2, ref: ref, probe: probe, base: expected - range });
  assert.strictEqual(best.dy, expected + 40, 'finds drifted offset');
  assert.ok(best.cost < best.expectedCost, 'drifted match is cheaper');
  console.log('ok - bestOffset detects drift');
})();

(function alignKeepsExpectedOnFlat() {
  var ref = new Array(600).fill(255);
  var probe = new Array(120).fill(255);
  var best = S.bestOffset({ expected: 1000, range: 240, step: 2, ref: ref, probe: probe, base: 760 });
  assert.strictEqual(best.dy, 1000, 'no signal keeps expected');
  console.log('ok - bestOffset flat fallback');
})();

(function alignKeepsExpectedOnNoise() {
  var ref = [];
  for (var y = 0; y < 600; y++) ref.push(255 - (y % 3));
  var probe = [];
  for (var j = 0; j < 120; j++) probe.push(255 - ((j + 37) % 5));
  var best = S.bestOffset({ expected: 260, range: 120, step: 2, ref: ref, probe: probe, base: 200 });
  assert.ok(Math.abs(best.dy - 260) <= 4, 'noise does not lure offset, got ' + best.dy);
  console.log('ok - bestOffset noise resilience');
})();

console.log('all stitch tests passed');
