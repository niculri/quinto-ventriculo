// Tells the administrators, without who, that a page failed in this browser: a file that did not load, an error nothing
// caught or a page left blank. A classic script loaded first, so it works even when the app itself cannot start.
(function (text) {
  var ENDPOINT = '/api/client-error';
  var MAX = 5;
  var sent = 0;
  var seen = {};
  var lastChunk = 0;
  // What the browser itself says when nothing of ours failed.
  var NOISE = /^Script error\.?$|ResizeObserver loop/;

  function own(url) {
    return typeof url === 'string' && url.indexOf(location.origin + '/') === 0;
  }

  function report(kind, message, stack) {
    var said = text.clean(message).slice(0, 300);
    if (kind === 'chunk') lastChunk = Date.now();
    var key = kind + '|' + said;
    if (sent >= MAX || seen[key]) return;
    seen[key] = true;
    sent += 1;
    var body = JSON.stringify({
      kind: kind,
      page: location.pathname.slice(0, 200),
      message: said,
      version: text.version(),
      stack: text.stack(stack),
      viewport: text.viewport(),
    });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
    } catch {
      // falls back to fetch
    }
    try {
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true }).catch(function () {
        // nothing else to try
      });
    } catch {
      // nothing else to try: an error report never breaks the page
    }
  }

  window.__qvReportError = report;

  // In the capture phase: a <script> or <link> that does not load fires `error` on itself, and it does not bubble.
  // Only the site's own files count: a script of someone else that a content blocker stops is not a failure of the site.
  window.addEventListener(
    'error',
    function (e) {
      var t = e.target;
      if (t && t.nodeType === 1) {
        var url = t.tagName === 'SCRIPT' ? t.src : t.tagName === 'LINK' ? t.href : '';
        if (own(url)) report('chunk', 'No cargó ' + url);
        return;
      }
      if ((e.filename && !own(e.filename)) || NOISE.test(e.message || '')) return;
      var where = e.filename ? ' (' + e.filename + ':' + e.lineno + ')' : '';
      report('unhandled', (e.message || 'Error') + where, e.error && e.error.stack);
    },
    true,
  );

  // A page of the app that cannot be imported is not an `error` of any element, and the router keeps its rejection:
  // Vite says so here. The <link> that failed, if there was one, tells which file, before or after this event
  // depending on the browser, so this waits a second to see whether it did.
  window.addEventListener('vite:preloadError', function (e) {
    var at = Date.now();
    var r = e.payload;
    setTimeout(function () {
      if (lastChunk > at - 3000) return;
      report('chunk', r && r.message ? r.message : 'No cargó un archivo');
    }, 1000);
  });

  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    report('unhandled', r && r.message ? r.message : String(r), r && r.stack);
  });

  // The app mounts in #root: still empty some seconds after everything loaded means a blank page.
  window.addEventListener('load', function () {
    setTimeout(function () {
      var root = document.getElementById('root');
      if (root && !root.firstChild) report('boot', 'La página quedó en blanco');
    }, 8000);
  });
})(
  // What a report says of the page, apart, so that each function stays short: the text without the site's address,
  // emails nor tokens, the stack as the Worker keeps it, the window and the deploy.
  (function () {
    function clean(text) {
      return String(text || '')
        .split(location.origin)
        .join('')
        .replace(/[^\s@<>()"']+@[^\s@<>()"']+/g, '(correo)')
        .replace(/[A-Za-z0-9_-]{24,}/g, '…');
    }

    // At most 15 lines of 200 characters.
    function stack(text) {
      return clean(text)
        .split('\n')
        .slice(0, 15)
        .map(function (line) {
          return line.replace(/\s+$/, '').slice(0, 200);
        })
        .join('\n')
        .slice(0, 1500);
    }

    function viewport() {
      var w = Math.round(window.innerWidth || 0);
      var h = Math.round(window.innerHeight || 0);
      return w > 0 && h > 0 && w < 100000 && h < 100000 ? w + 'x' + h : '';
    }

    function version() {
      var s = document.querySelector('script[type="module"][src*="/assets/"]');
      var m = s && /\/assets\/index[.-]([A-Za-z0-9_-]+)\.js/.exec(s.src);
      return m ? m[1] : '';
    }

    return { clean: clean, stack: stack, viewport: viewport, version: version };
  })(),
);
