(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    var base = document.baseURI || window.location.href;
    var swUrl = new URL('sw.js', base);
    navigator.serviceWorker.register(swUrl, { scope: './' }).catch(function (err) {
      console.warn('D&L ACC offline support unavailable:', err);
    });
  });
})();
