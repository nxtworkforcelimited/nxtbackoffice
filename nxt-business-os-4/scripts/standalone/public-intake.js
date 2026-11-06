(() => {
  const form = document.getElementById('nxtLeadForm');
  if (!form) return;
  const endpoint = "https://cbcgpxtlxqmuzhxkutso.supabase.co/rest/v1/nxt_website_enquiries";
  const publicKey = "sb_publishable_RYpkY8vkkmcDPmxv2w6WVQ_c_vww3CD";
  const categories = {"Social media management": "Marketing & design", "Email marketing": "Marketing & design", "Content writing": "Marketing & design", "Branding and graphic design": "Marketing & design", "Paid advertising": "Marketing & design", "SEO": "Marketing & design", "Google Business Profile management": "Marketing & design", "Website design and development": "Websites & systems", "Web applications and portals": "Websites & systems", "CRM setup and business systems": "Websites & systems", "Domain registration": "Domains & hosting", "AI integration and automation": "Websites & systems", "WhatsApp Business messaging and bots": "Websites & systems", "Business SMS messaging": "Websites & systems", "Custom back-office development": "Websites & systems", "Managed contact centre services": "General enquiry", "Customer support": "General enquiry", "Cold calling and outbound sales": "General enquiry", "Lead generation and lead-list sourcing": "General enquiry", "Market research": "General enquiry", "Virtual assistants": "Virtual assistance", "Data capturing and data processing": "General enquiry", "Managed Data Storage & Protection": "General enquiry", "SME digital packages": "Websites & systems", "NXT Business OS walkthrough": "Websites & systems", "Domains & hosting": "Domains & hosting"};
  const submit = form.querySelector('button[type="submit"]');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  form.append(status);
  const field = name => form.querySelector('[name="' + name + '"]')?.value.trim() || '';
  const detail = key => form.querySelector('[data-field="' + key + '"]')?.value.trim() || '';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled || field('website')) return;
    const isAudit = field('name') === 'Free Audit Request';
    const topic = detail('service') || 'General enquiry';
    const subject = isAudit ? 'Free audit: ' + topic : topic;
    const rows = [subject, detail('challenge'), field('partner_name') && 'Company: ' + field('partner_name'),
      field('phone') && 'Phone: ' + field('phone'), detail('contact_method') && 'Preferred contact: ' + detail('contact_method'),
      detail('industry') && 'Industry: ' + detail('industry')];
    const payload = {name: field('contact_name'), email: field('email_from'), service: isAudit ? 'General enquiry' : (categories[topic] || 'General enquiry'), message: rows.filter(Boolean).join('\n')};
    if (payload.name.length < 2 || payload.name.length > 120 || payload.email.length > 254 || detail('challenge').length < 10 || payload.message.length > 4000) {
      status.textContent = 'Please enter your name and a description of at least 10 characters. Keep the complete enquiry under 4,000 characters.';
      return;
    }
    const original = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Sending…';
    status.textContent = 'Sending your enquiry…';
    let redirecting = false;
    try {
      const response = await fetch(endpoint, {method:'POST', headers:{apikey:publicKey, 'Content-Type':'application/json', Prefer:'return=minimal'}, body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
      if (!response.ok) throw new Error('Could not save');
      form.reset();
      status.textContent = isAudit ? 'Thank you. Your audit request has been received.' : topic === 'Domain registration'
        ? 'Request received. We will confirm availability and fees before registering your domain.'
        : 'Thank you. NXT has received your enquiry about ' + topic + '.';
      if (isAudit) {
        // Set the receipt only after the database confirms the insert. No personal data is stored.
        try {
          sessionStorage.setItem('nxt.audit.receipt.v1', JSON.stringify({submittedAt: Date.now(), tracked: false}));
          window.location.assign('/thank-you');
          redirecting = true;
        } catch {
          // Receipt storage may be disabled. Keep the confirmed success message on this page.
        }
      }
    } catch {
      status.textContent = 'We could not confirm receipt. Please try again or email hello@nxt-workforce.com.';
    } finally {
      if (!redirecting) {submit.disabled = false; submit.textContent = original;}
    }
  });
})();
