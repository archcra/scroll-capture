(function () {
  if (window.__SC_CONTENT_LOADED__) return;
  window.__SC_CONTENT_LOADED__ = true;

  var targetEl = null;
  var mode = null;
  var overlayRecords = [];

  function intersects(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function restoreOverlays() {
    for (var i = 0; i < overlayRecords.length; i++) {
      var rec = overlayRecords[i];
      try {
        if (rec.value) rec.el.style.setProperty(rec.prop, rec.value, rec.priority);
        else rec.el.style.removeProperty(rec.prop);
      } catch (e) {}
    }
    overlayRecords = [];
  }

  function applyOverlays(rect) {
    restoreOverlays();
    if (!rect || !document.body) return 0;
    var all = document.body.getElementsByTagName('*');
    var limit = Math.min(all.length, 20000);
    for (var i = 0; i < limit; i++) {
      var el = all[i];
      if (!el || el.nodeType !== 1) continue;
      if (el === targetEl || el.contains(targetEl)) continue;

      var cs;
      try {
        cs = window.getComputedStyle(el);
      } catch (e) {
        continue;
      }
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;

      var r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;

      var handled = false;
      if ((cs.position === 'fixed' || cs.position === 'sticky') && intersects(r, rect)) {
        var rec = { el: el, prop: '', value: '', priority: '' };
        if (cs.position === 'sticky') {
          rec.prop = 'position';
          rec.value = el.style.getPropertyValue('position');
          rec.priority = el.style.getPropertyPriority('position');
          el.style.setProperty('position', 'static', 'important');
        } else {
          rec.prop = 'visibility';
          rec.value = el.style.getPropertyValue('visibility');
          rec.priority = el.style.getPropertyPriority('visibility');
          el.style.setProperty('visibility', 'hidden', 'important');
        }
        overlayRecords.push(rec);
        handled = true;
      }

      if (!handled && cs.contentVisibility === 'auto') {
        var cv = { el: el, prop: 'content-visibility', value: el.style.getPropertyValue('content-visibility'), priority: el.style.getPropertyPriority('content-visibility') };
        el.style.setProperty('content-visibility', 'visible', 'important');
        overlayRecords.push(cv);
      }
    }
    return overlayRecords.length;
  }

  function currentHeight() {
    return (mode === 'container' && targetEl) ? targetEl.scrollHeight : document.documentElement.scrollHeight;
  }

  function currentTop() {
    return (mode === 'container' && targetEl) ? targetEl.scrollTop : window.scrollY;
  }

  function scrollTopZero() {
    if (mode === 'container' && targetEl) targetEl.scrollTop = 0;
    else window.scrollTo(0, 0);
  }

  function settleTop(capMs) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      var lastH = -1;
      var stable = 0;
      function tick() {
        scrollTopZero();
        setTimeout(function () {
          var h = currentHeight();
          if (h === lastH && currentTop() <= 4) stable++;
          else stable = 0;
          lastH = h;
          if (stable >= 2) {
            resolve({ ok: true, scrollHeight: currentHeight(), waited: Date.now() - t0 });
            return;
          }
          if (Date.now() - t0 >= capMs) {
            resolve({ ok: false, scrollHeight: currentHeight(), waited: Date.now() - t0 });
            return;
          }
          tick();
        }, 300);
      }
      tick();
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.target !== 'content') return;

    if (msg.type === 'SC_DETECT') {
      var res = window.SC ? window.SC.detectTarget(document, window) : null;
      if (!res) {
        sendResponse(null);
        return true;
      }
      targetEl = res.el || null;
      mode = res.mode;
      sendResponse({
        mode: res.mode,
        rect: res.rect,
        scrollHeight: res.scrollHeight,
        clientHeight: res.clientHeight,
        startScrollTop: res.startScrollTop,
        leftInset: res.leftInset || 0,
        confidence: res.confidence,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        dpr: window.devicePixelRatio || 1
      });
      return true;
    }

    if (msg.type === 'SC_PREP') {
      var count = applyOverlays(msg.rect);
      sendResponse({ ok: true, count: count });
      return true;
    }

    if (msg.type === 'SC_SETTLE_TOP') {
      settleTop(msg.capMs || 6000).then(function (r) {
        sendResponse(r);
      });
      return true;
    }

    if (msg.type === 'SC_SCROLL') {
      if (mode === 'container' && targetEl) {
        targetEl.scrollTop = msg.y;
      } else {
        window.scrollTo(0, msg.y);
      }
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var actual = (mode === 'container' && targetEl) ? targetEl.scrollTop : window.scrollY;
          sendResponse({ scrollTop: actual, scrollHeight: currentHeight() });
        });
      });
      return true;
    }

    if (msg.type === 'SC_RESTORE_OVERLAYS') {
      restoreOverlays();
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'SC_RESTORE') {
      if (mode === 'container' && targetEl) {
        targetEl.scrollTop = msg.y;
      } else {
        window.scrollTo(0, msg.y);
      }
      restoreOverlays();
      sendResponse({ ok: true });
      return true;
    }
  });
})();
