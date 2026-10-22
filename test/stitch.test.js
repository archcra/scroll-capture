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

console.log('all stitch tests passed');
