(() => {
  const key = 'nxt.audit.receipt.v1';
  let receipt;
  try {
    receipt = JSON.parse(sessionStorage.getItem(key) || 'null');
  } catch { return; }
  const age = receipt && Date.now() - receipt.submittedAt;
  if (!receipt || !Number.isFinite(receipt.submittedAt) || age < 0 || age > 30 * 60 * 1000) return;

  document.getElementById('audit-confirmation').hidden = false;
  document.getElementById('audit-start').hidden = true;
  if (receipt.tracked !== false) return;
  try {
    // Consume before loading Google: refreshing or reopening this page must not track again.
    sessionStorage.setItem(key, JSON.stringify({...receipt, tracked: true}));
  } catch { return; }

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', 'G-K5EMQ7FDDH');
  window.gtag('config', 'AW-18558377672');
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=G-K5EMQ7FDDH';
  document.head.appendChild(script);
})();
