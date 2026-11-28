// Tells the administrators that a page failed in this browser: a file that did not load, an error nothing caught or a
// page left blank. A classic script loaded first, so it works even when the app itself cannot start.
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
    // With a session it goes by fetch, which can carry it; sendBeacon cannot.
    var session = text.session();
    try {
      if (!session && navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
    } catch {
      // falls back to fetch
    }
    var headers = session ? { Authorization: 'Bearer ' + session } : {};
    try {
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: headers }).catch(
        function () {
          // nothing else to try
        },
      );
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
    // An email needs a domain with a dot right after the @: a Safari or Firefox frame (f@/assets/x.js:1:2) is not one.
    function clean(text) {
      return String(text || '')
        .split(location.origin)
        .join('')
        .replace(/[^\s@<>()"'/:[\]]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, '(correo)')
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

    // The token of the session the site already keeps (Supabase's; the demo's, which only the local demo accepts), so
    // that the Worker, which verifies it, knows whose browser it was. Only if this browser's account accepted the
    // privacy policy this page names; without that, or without a session, or expired, the report goes alone.
    function session() {
      try {
        var meta = document.querySelector('meta[name="qv-privacy-version"]');
        var inForce = meta && meta.getAttribute('content');
        var mark = JSON.parse(localStorage.getItem('qv-privacy-accepted') || 'null');
        if (!inForce || !mark || mark.privacy !== inForce || typeof mark.user !== 'string')
          return '';
        // The demo has a single account.
        if (localStorage.getItem('qv-demo-session') === '1') return 'demo-local';
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i) || '';
          if (!/^sb-[a-z0-9]+-auth-token$/.test(key)) continue;
          var s = JSON.parse(localStorage.getItem(key) || 'null');
          var fresh = s && (!s.expires_at || s.expires_at * 1000 > Date.now());
          var own = s && s.user && s.user.id === mark.user;
          if (fresh && own && typeof s.access_token === 'string') return s.access_token;
        }
      } catch {
        // blocked storage or a value that is not JSON: without a session
      }
      return '';
    }

    return { clean: clean, stack: stack, viewport: viewport, version: version, session: session };
  })(),
);
