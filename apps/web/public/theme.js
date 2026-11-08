// Applies the theme before painting, so it does not flicker (the CSP does not allow inline scripts).
(function () {
  var t = 'system';
  try {
    t = localStorage.getItem('qv-theme') || 'system';
  } catch {
    // no storage (private browsing): the system one is used
  }
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();
