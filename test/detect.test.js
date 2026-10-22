var assert = require('assert');
var SC = require('../lib/detect.js');

function makeEl(o) {
  o = o || {};
  return {
    nodeType: 1,
    scrollHeight: o.scrollHeight || 0,
    clientHeight: o.clientHeight || 0,
    scrollTop: o.scrollTop || 0,
    parentElement: o.parent || null,
    __cs: o.cs || { position: 'static', overflowY: 'visible' },
    getBoundingClientRect: function () { return o.rect; }
  };
}

function makeWin(w, h, scrollY) {
  return {
    innerWidth: w,
    innerHeight: h,
    scrollY: scrollY || 0,
    getComputedStyle: function (el) { return el.__cs; }
  };
}

function makeDoc(probe, docEl, sidebars) {
  return {
    elementFromPoint: function () { return probe; },
    documentElement: docEl,
    scrollingElement: docEl,
    querySelectorAll: function () { return sidebars || []; }
  };
}

function rect(left, top, width, height) {
  return { left: left, top: top, width: width, height: height, right: left + width, bottom: top + height };
}

var win = makeWin(1400, 800, 0);

(function caseInnerContainer() {
  var docEl = makeEl({
    rect: rect(0, 0, 1400, 800),
    scrollHeight: 800,
    clientHeight: 800,
    cs: { position: 'static', overflowY: 'visible' }
  });
  var container = makeEl({
    rect: rect(240, 0, 1160, 800),
    scrollHeight: 9000,
    clientHeight: 800,
    cs: { position: 'static', overflowY: 'auto' }
  });
  container.parentElement = docEl;
  var probe = makeEl({ parent: container });
  var doc = makeDoc(probe, docEl, []);
  var r = SC.detectTarget(doc, win);
  assert.strictEqual(r.mode, 'container', 'inner scroll -> container mode');
  assert.strictEqual(Math.round(r.rect.left), 240, 'container x offset');
  assert.strictEqual(r.scrollHeight, 9000, 'container scrollHeight');
  console.log('ok - inner scroll container');
})();

(function caseDocumentWithFixedSidebar() {
  var docEl = makeEl({
    rect: rect(0, 0, 1400, 800),
    scrollHeight: 9000,
    clientHeight: 800,
    cs: { position: 'static', overflowY: 'visible' }
  });
  var probe = makeEl({ parent: docEl });
  var sidebar = makeEl({
    rect: rect(0, 0, 240, 800),
    cs: { position: 'fixed', overflowY: 'auto' }
  });
  var doc = makeDoc(probe, docEl, [sidebar]);
  var r = SC.detectTarget(doc, win);
  assert.strictEqual(r.mode, 'document', 'doc scroll -> document mode');
  assert.strictEqual(Math.round(r.leftInset), 240, 'fixed sidebar cropped');
  assert.strictEqual(Math.round(r.rect.width), 1160, 'document width minus sidebar');
  console.log('ok - document scroll with fixed sidebar');
})();

(function caseTinyScrollerOnTopOfDocument() {
  var docEl = makeEl({
    rect: rect(0, 0, 1400, 800),
    scrollHeight: 9000,
    clientHeight: 800,
    cs: { position: 'static', overflowY: 'visible' }
  });
  var tiny = makeEl({
    rect: rect(700, 300, 60, 60),
    scrollHeight: 500,
    clientHeight: 60,
    cs: { position: 'static', overflowY: 'auto' }
  });
  tiny.parentElement = docEl;
  var doc = makeDoc(tiny, docEl, []);
  var r = SC.detectTarget(doc, win);
  assert.strictEqual(r.mode, 'document', 'tiny code box skipped, document chosen');
  console.log('ok - tiny scroller skipped');
})();

(function caseNothingScrollable() {
  var docEl = makeEl({
    rect: rect(0, 0, 1400, 800),
    scrollHeight: 800,
    clientHeight: 800,
    cs: { position: 'static', overflowY: 'visible' }
  });
  var probe = makeEl({ parent: docEl });
  var doc = makeDoc(probe, docEl, []);
  var r = SC.detectTarget(doc, win);
  assert.strictEqual(r, null, 'no scrollable -> null');
  console.log('ok - nothing scrollable returns null');
})();

console.log('all detection tests passed');
