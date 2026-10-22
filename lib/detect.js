(function (g) {
  if (g.SC) return;

  function isScrollable(el, win) {
    if (!el || el.nodeType !== 1) return false;
    var cs;
    try {
      cs = win.getComputedStyle(el);
    } catch (e) {
      return false;
    }
    var oy = cs.overflowY;
    if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
    return (el.scrollHeight - el.clientHeight) > 8;
  }

  function visibleArea(el, win) {
    var r = el.getBoundingClientRect();
    var vw = win.innerWidth;
    var vh = win.innerHeight;
    var w = Math.min(r.right, vw) - Math.max(r.left, 0);
    var h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    if (w <= 0 || h <= 0) return 0;
    return w * h;
  }

  function isDocScrollable(doc) {
    var se = doc.scrollingElement || doc.documentElement;
    if (!se) return false;
    return (se.scrollHeight - se.clientHeight) > 8;
  }

  function detectLeftInset(doc, win) {
    var best = 0;
    var nodes;
    try {
      nodes = doc.querySelectorAll('body *');
    } catch (e) {
      return 0;
    }
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var cs;
      try {
        cs = win.getComputedStyle(el);
      } catch (e) {
        continue;
      }
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      var r = el.getBoundingClientRect();
      if (r.width < 80 || r.width > win.innerWidth * 0.5) continue;
      if (r.height < win.innerHeight * 0.8) continue;
      if (r.top > 4) continue;
      if (r.left < -2 || r.left > 24) continue;
      if (r.right > best) best = r.right;
    }
    return best;
  }

  function docTarget(doc, win) {
    var se = doc.scrollingElement || doc.documentElement;
    var docEl = doc.documentElement;
    var total = Math.max(se ? se.scrollHeight : 0, docEl ? docEl.scrollHeight : 0);
    var inset = detectLeftInset(doc, win);
    return {
      mode: 'document',
      el: se,
      rect: { left: inset, top: 0, width: win.innerWidth - inset, height: win.innerHeight },
      scrollHeight: total,
      clientHeight: win.innerHeight,
      startScrollTop: win.scrollY || 0,
      leftInset: inset,
      confidence: 'medium'
    };
  }

  function detectTarget(doc, win) {
    var vw = win.innerWidth;
    var vh = win.innerHeight;
    var vpArea = vw * vh;
    var probeX = Math.round(vw * 0.62);
    var probeY = Math.round(vh * 0.5);

    var start = null;
    try {
      start = doc.elementFromPoint(probeX, probeY);
    } catch (e) {
      start = null;
    }

    var chain = [];
    var el = start;
    while (el && el.nodeType === 1) {
      if (isScrollable(el, win)) chain.push(el);
      el = el.parentElement;
    }

    var se = doc.scrollingElement || doc.documentElement;
    var docScrollable = isDocScrollable(doc);
    if (se && docScrollable && chain.indexOf(se) === -1) chain.push(se);

    var threshold = vpArea * 0.30;
    var target = null;
    for (var i = 0; i < chain.length; i++) {
      if (visibleArea(chain[i], win) >= threshold) {
        target = chain[i];
        break;
      }
    }

    if (!target) {
      if (docScrollable) return docTarget(doc, win);
      if (!chain.length) return null;
      target = chain.reduce(function (best, c) {
        return visibleArea(c, win) > visibleArea(best, win) ? c : best;
      }, chain[0]);
    }

    if (target === se || target === doc.documentElement) return docTarget(doc, win);

    var r = target.getBoundingClientRect();
    return {
      mode: 'container',
      el: target,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      scrollHeight: target.scrollHeight,
      clientHeight: target.clientHeight,
      startScrollTop: target.scrollTop || 0,
      leftInset: 0,
      confidence: chain.length === 1 ? 'high' : 'medium'
    };
  }

  g.SC = {
    isScrollable: isScrollable,
    isDocScrollable: isDocScrollable,
    visibleArea: visibleArea,
    detectLeftInset: detectLeftInset,
    detectTarget: detectTarget
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = g.SC;
})(typeof window !== 'undefined' ? window : globalThis);
