(() => {
  const menu = document.querySelector('header .nxt-services-menu');
  if (!menu) return;
  const trigger = menu.querySelector('summary');
  const nav = menu.closest('nav');
  const other = nav.querySelector('.site-menu,.menu-toggle');
  menu.addEventListener('toggle', () => {
    if (menu.open && other?.getAttribute('aria-expanded') === 'true') {
      other.setAttribute('aria-expanded', 'false');
      nav.querySelector('.links')?.classList.remove('open');
    }
  });
  other?.addEventListener('click', () => { menu.open = false; });
  document.addEventListener('pointerdown', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('focusin', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      trigger.focus();
    }
  });
  menu.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    menu.open = false;
    const adviser = document.querySelector('.nxt-ask-ai');
    if (link.hasAttribute('data-open-adviser') && adviser) {
      event.preventDefault();
      adviser.click();
    }
  });
})();
