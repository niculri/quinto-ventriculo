// Applies the theme before painting, so it does not flicker (the CSP does not allow inline scripts).
(function () {
  var t = 'light';
  try {
    t = localStorage.getItem('qv-theme') || 'light';
  } catch {
    // no storage (private browsing): the light one is used
  }
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();
