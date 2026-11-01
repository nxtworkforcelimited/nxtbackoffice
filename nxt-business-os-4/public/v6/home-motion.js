(() => {
  const strip = document.querySelector('[data-logo-shell]');
  const pause = strip?.querySelector('.logo-pause');
  if (pause) {
    pause.addEventListener('click', () => {
      const stopped = strip.classList.toggle('paused');
      pause.setAttribute('aria-pressed', String(stopped));
      pause.textContent = stopped ? 'Play logos' : 'Pause logos';
    });
  }

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

  const dialog = document.querySelector('#os-newsletter');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const form = dialog.querySelector('form');
  const status = dialog.querySelector('.news-status');
  const signup = form.querySelector('button[type="submit"]');
  const key = 'nxt.business-os.newsletter.v1';
  const readPreference = () => {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; }
    catch { return {}; }
  };
  const remember = state => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} };
  const open = manual => {
    if (dialog.open) return;
    const preference = readPreference();
    if (!manual && (preference.joined || preference.laterUntil > Date.now())) return;
    form.hidden = Boolean(preference.joined);
    status.textContent = preference.joined ? 'You’ve joined the newsletter on this device.' : '';
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
    if (!readPreference().joined) remember({laterUntil: Date.now() + 30 * 86400000});
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (signup.disabled || form.elements.website.value) return;
    signup.disabled = true;
    status.textContent = 'Saving your signup…';
    try {
      const response = await fetch('https://cbcgpxtlxqmuzhxkutso.supabase.co/rest/v1/rpc/nxt_newsletter_subscribe', {
        method:'POST', headers:{'Content-Type':'application/json',apikey:'sb_publishable_RYpkY8vkkmcDPmxv2w6WVQ_c_vww3CD'},
        body:JSON.stringify({p_email:form.elements.email.value.trim(),p_consent:form.elements.consent.checked}),
        signal:AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error('Could not save');
      remember({joined:true});
      form.hidden = true;
      status.textContent = 'You’re on the list. Thank you for following the NXT Business OS build.';
      dialog.querySelector('[data-dismiss-news]').textContent = 'Close';
      dialog.querySelector('[data-dismiss-news]').focus();
    } catch {
      status.textContent = 'We could not confirm your signup. Please try again.';
    } finally { signup.disabled = false; }
  });
  if (!location.hash) window.setTimeout(() => open(false), 700);
})();
