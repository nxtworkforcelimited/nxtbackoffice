(() => {
  const chat = document.querySelector('[data-chat-example]');
  if (chat) {
    const play = () => {
      chat.classList.remove('chat-playing');
      void chat.offsetWidth;
      chat.classList.add('chat-playing');
    };
    chat.querySelector('.chat-replay').addEventListener('click', play);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { play(); observer.disconnect(); }
      }, {threshold:0.35});
      observer.observe(chat);
    }
  }

  const rpcBase = 'https://cbcgpxtlxqmuzhxkutso.supabase.co/rest/v1/rpc/';
  const publicKey = 'sb_publishable_RYpkY8vkkmcDPmxv2w6WVQ_c_vww3CD';

  function wireSignup(form, rpc, status, saved) {
    const submit = form.querySelector('[type="submit"]');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled || form.elements.website.value) return;
      submit.disabled = true;
      status.textContent = 'Saving your signup…';
      try {
        const response = await fetch(rpcBase + rpc, {
          method:'POST', headers:{'Content-Type':'application/json',apikey:publicKey},
          body:JSON.stringify({p_email:form.elements.email.value.trim(),p_consent:form.elements.consent.checked}),
          signal:AbortSignal.timeout(20000)
        });
        if (!response.ok) throw new Error('Could not save');
        form.reset();
        saved();
      } catch {
        status.textContent = 'We could not confirm your signup. Please try again.';
      } finally { submit.disabled = false; }
    });
  }

  const crm = document.querySelector('#crm-waiting-list');
  if (crm) {
    const status = crm.querySelector('[role="status"]');
    wireSignup(crm, 'nxt_crm_waitlist_join', status, () => {
      status.textContent = 'Thank you. You’re on the NXT Business OS waiting list. We’ll email you about access.';
    });
  }

  const dialog = document.querySelector('#nxt-newsletter');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const form = dialog.querySelector('form');
  const status = dialog.querySelector('.news-status');
  const key = 'nxt.workforce.newsletter.v1';
  const readPreference = () => {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; }
    catch { return {}; }
  };
  const dismissalKey = 'nxt.workforce.newsletter.dismissed';
  const dismissedThisVisit = () => {
    try { return sessionStorage.getItem(dismissalKey) === '1'; }
    catch { return false; }
  };
  const newsletterLink = () => ['#newsletter', '#nxt-newsletter'].includes(location.hash);
  const remember = state => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} };
  const open = manual => {
    if (dialog.open) return;
    const preference = readPreference();
    if (!manual && (preference.joined || dismissedThisVisit() || location.hash || document.querySelector('dialog[open]'))) return;
    form.hidden = Boolean(preference.joined);
    status.textContent = preference.joined ? 'You’ve joined the NXT Workforce newsletter on this device.' : '';
    dialog.querySelector('[data-dismiss-news]').textContent = preference.joined ? 'Close' : 'Maybe later';
    dialog.showModal();
  };

  document.querySelectorAll('[data-open-news]').forEach(button =>
    button.addEventListener('click', () => open(true)));
  dialog.querySelector('.news-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-dismiss-news]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    }
  });
  dialog.addEventListener('close', () => {
    try { sessionStorage.setItem(dismissalKey, '1'); } catch {}
  });
  wireSignup(form, 'nxt_company_newsletter_subscribe', status, () => {
    remember({joined:true});
    form.hidden = true;
    status.textContent = 'You’re on the list. Thank you for joining the NXT Workforce newsletter.';
    dialog.querySelector('[data-dismiss-news]').textContent = 'Close';
    if (dialog.open) dialog.querySelector('[data-dismiss-news]').focus();
  });
  window.addEventListener('hashchange', () => { if (newsletterLink()) open(true); });
  if (newsletterLink()) open(true);
  else if (!location.hash) window.setTimeout(() => open(false), 700);
})();
