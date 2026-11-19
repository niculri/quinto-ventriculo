// Tells the administrators, without who, that a page failed in this browser: a file that did not load, an error nothing
// caught or a page left blank. A classic script loaded first, so it works even when the app itself cannot start.
(function () {
  var ENDPOINT = '/api/client-error';
  var MAX = 5;
  var sent = 0;
  var seen = {};

  function version() {
    var s = document.querySelector('script[type="module"][src*="/assets/"]');
    var m = s && /\/assets\/index[.-]([A-Za-z0-9_-]+)\.js/.exec(s.src);
    return m ? m[1] : '';
  }

  function scrub(text) {
    return String(text || '')
      .split(location.origin)
      .join('')
      .replace(/[^\s@<>()"']+@[^\s@<>()"']+/g, '(correo)')
      .replace(/[A-Za-z0-9_-]{24,}/g, '…')
      .slice(0, 300);
  }

  function report(kind, message) {
    var text = scrub(message);
    var key = kind + '|' + text;
    if (sent >= MAX || seen[key]) return;
    seen[key] = true;
    sent += 1;
    var body = JSON.stringify({
      kind: kind,
      page: location.pathname.slice(0, 200),
      message: text,
      version: version(),
    });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
    } catch {
      // falls back to fetch
    }
    try {
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true }).catch(function () {});
    } catch {
      // nothing else to try: an error report never breaks the page
    }
  }

  window.__qvReportError = report;

  // In the capture phase: a <script> or <link> that does not load fires `error` on itself, and it does not bubble.
  window.addEventListener(
    'error',
    function (e) {
      var t = e.target;
      if (t && t !== window && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
        report('chunk', 'No cargó ' + (t.src || t.href || t.tagName));
        return;
      }
      var where = e.filename ? ' (' + e.filename + ':' + e.lineno + ')' : '';
      report('unhandled', (e.message || 'Error') + where);
    },
    true,
  );

  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    report('unhandled', r && r.message ? r.message : String(r));
  });

  // The app mounts in #root: still empty some seconds after everything loaded means a blank page.
  window.addEventListener('load', function () {
    setTimeout(function () {
      var root = document.getElementById('root');
      if (root && !root.firstChild) report('boot', 'La página quedó en blanco');
    }, 8000);
  });
})();
