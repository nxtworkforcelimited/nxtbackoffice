(() => {
  const opened = () => document.querySelector('header details.nxt-nav-disclosure[open]');
  function dismissOutside(event) {
    const menu = opened();
    if (menu && !menu.contains(event.target)) menu.open = false;
  }
  document.addEventListener('pointerdown', dismissOutside);
  document.addEventListener('focusin', dismissOutside);
  document.addEventListener('keydown', event => {
    const menu = opened();
    if (event.key === 'Escape' && menu) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('header .nxt-nav-panel a');
    if (!link) return;
    link.closest('details').open = false;
    if (link.hasAttribute('data-open-adviser')) {
      const adviser = document.querySelector('.nxt-ask-ai');
      if (adviser) { event.preventDefault(); adviser.click(); }
    }
  });
})();
