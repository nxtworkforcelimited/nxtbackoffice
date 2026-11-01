(() => {
  const form = document.querySelector('#domain-search');
  if (!form) return;
  const input = form.querySelector('#domain-name');
  const submit = form.querySelector('[type="submit"]');
  const status = document.querySelector('#domain-status');
  const results = document.querySelector('#domain-results');
  const list = results.querySelector('.domain-result-list');
  let activeRequest = null;

  const labels = {
    available: ['Available', 'Register domain'],
    unavailable: ['Unavailable', 'Ask about alternatives'],
    unconfirmed: ['', ''],
  };

  function enquiryLink(domain, label) {
    const link = document.createElement('a');
    link.className = 'btn';
    const params = new URLSearchParams({service: 'Domain registration', domain});
    link.href = '/contact?' + params.toString() + '#nxtLeadForm';
    link.textContent = label;
    return link;
  }

  function showResults(items) {
    list.replaceChildren();
    for (const item of items.filter(row => row.status !== 'unconfirmed')) {
      const card = document.createElement('article');
      card.className = 'domain-result';
      const copy = document.createElement('div');
      const name = document.createElement('h3');
      name.textContent = item.domain;
      const badge = document.createElement('span');
      badge.className = 'domain-badge domain-' + item.status;
      badge.textContent = labels[item.status][0];
      copy.append(badge, name);
      card.append(copy);
      if (item.status === 'available') {
        const register = document.createElement('button');
        register.type = 'button'; register.className = 'btn primary'; register.textContent = 'Register domain';
        register.addEventListener('click', () => document.dispatchEvent(new CustomEvent('nxt-register-domain', {detail: {domain: item.domain}})));
        card.append(register);
      }
      list.append(card);
    }
    results.hidden = false;
  }

  function clearSearch() {
    activeRequest?.abort();
    activeRequest = null;
    submit.disabled = false;
    submit.textContent = 'Search domains';
    form.removeAttribute('aria-busy');
    results.hidden = true;
    status.replaceChildren();
    input.removeAttribute('aria-invalid');
  }
  input.addEventListener('input', clearSearch);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const name = input.value.trim();
    results.hidden = true;
    status.textContent = 'Checking your domain name…';
    input.removeAttribute('aria-invalid');
    submit.disabled = true;
    submit.textContent = 'Searching…';
    form.setAttribute('aria-busy', 'true');
    const timeout = setTimeout(() => controller.abort(), 22000);
    try {
      const response = await fetch('/api/public/domain-search', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name}),
        signal: controller.signal,
      });
      const data = await response.json();
      if (activeRequest !== controller) return;
      if (response.status === 400) {
        input.setAttribute('aria-invalid', 'true');
        status.textContent = data.error || 'Please enter a valid business name or domain.';
        input.focus();
        return;
      }
      if (!response.ok || !Array.isArray(data.results) || !data.results.length ||
          data.results.some(item => typeof item.domain !== 'string' || !Object.hasOwn(labels, item.status))) {
        throw new Error('Search unavailable');
      }
      showResults(data.results);
      status.textContent = data.results.some(item => item.status === 'unconfirmed') ? 'Some checks could not be completed. Please try again.' : '';
      if (data.results.every(item => item.status === 'unconfirmed')) results.hidden = true;
      results.querySelector('h2').focus();
    } catch {
      if (activeRequest !== controller) return;
      status.replaceChildren(document.createTextNode('The search is temporarily unavailable. Try again or '));
      status.append(enquiryLink(name, 'ask NXT to check this name'));
    } finally {
      clearTimeout(timeout);
      if (activeRequest === controller) {
        activeRequest = null;
        submit.disabled = false;
        submit.textContent = 'Search domains';
        form.removeAttribute('aria-busy');
      }
    }
  });
})();
