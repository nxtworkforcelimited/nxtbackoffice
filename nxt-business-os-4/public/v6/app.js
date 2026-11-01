
(function(){
  const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('in')}),{threshold:.12});
  document.querySelectorAll('.reveal-left,.reveal-right,.reveal-up,.meet-grid,.image-card').forEach(el=>io.observe(el));

  document.querySelectorAll('.engine-row').forEach(row=>row.addEventListener('click',()=>{
    document.querySelectorAll('.engine-row').forEach(x=>{if(x!==row)x.classList.remove('open')});
    row.classList.toggle('open');
  }));

  document.querySelectorAll('.filter').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    const cat=btn.dataset.cat;
    document.querySelectorAll('.service-card').forEach(card=>{
      card.style.display=(cat==='All'||card.dataset.cat===cat)?'flex':'none';
    });
  }));

  document.querySelectorAll('.help-tabs').forEach(tabset=>{
    const buttons=tabset.querySelectorAll('.help-chip');
    const panels=tabset.parentElement.querySelectorAll('.help-panel');
    buttons.forEach((btn,i)=>btn.addEventListener('click',()=>{
      buttons.forEach(x=>x.classList.remove('active'));
      panels.forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
      if(panels[i])panels[i].classList.add('active');
    }));
  });

  document.querySelectorAll('.news-filter button').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.news-filter button').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    const cat=btn.dataset.news;
    document.querySelectorAll('[data-news-card]').forEach(card=>{
      card.style.display=(cat==='All'||card.dataset.newsCard===cat)?'flex':'none';
    });
  }));

  const waBtn=document.getElementById('waBtn'),waPanel=document.getElementById('waPanel');
  if(waBtn&&waPanel)waBtn.addEventListener('click',()=>waPanel.classList.toggle('show'));

  const form=document.getElementById('nxtLeadForm');
  if(form){
    form.addEventListener('submit',()=>{
      const service=form.querySelector('[data-field="service"]')?.value||'Not specified';
      const industry=form.querySelector('[data-field="industry"]')?.value||'Not specified';
      const challenge=form.querySelector('[data-field="challenge"]')?.value||'Not specified';
      const contactMethod=form.querySelector('[data-field="contact_method"]')?.value||'Not specified';
      const desc=form.querySelector('input[name="description"]');
      if(desc)desc.value='Service / audit: '+service+'\nIndustry: '+industry+'\nWhat is happening: '+challenge+'\nPreferred contact method: '+contactMethod+'\nSource: NXT Workforce website';
    });
  }

  const params=new URLSearchParams(location.search);
  const audit=params.get('audit');
  const auditSelect=document.querySelector('#audit-form select[data-field="service"]');
  if(audit&&auditSelect){
    [...auditSelect.options].forEach(o=>{if(o.value===audit||o.text===audit)auditSelect.value=o.value});
  }
  document.querySelectorAll('[data-audit]').forEach(card=>card.addEventListener('click',()=>{
    if(auditSelect)auditSelect.value=card.dataset.audit;
    setTimeout(()=>document.getElementById('audit-form')?.scrollIntoView({behavior:'smooth'}),50);
  }));
})();


(function(){
  const overlay=document.getElementById('siteSearchOverlay');
  const openBtn=document.getElementById('searchToggle');
  const closeBtn=document.getElementById('searchClose');
  const input=document.getElementById('siteSearchInput');
  const results=document.getElementById('siteSearchResults');
  if(!overlay||!openBtn||!input||!results)return;

  const prefix='/';
  const items=[
    ['Domain registration','Register or set up your domain','domains'],
    ['Monthly data protection','Monthly record handling and POPIA support','services/data-protection'],
    ['Services','Digital, sales, outsourcing and technology support','services.html'],
    ['Email Marketing','Campaigns, newsletters and automation','services/digital/email-marketing.html'],
    ['SEO','Search visibility and on-page optimisation','services/digital/seo.html'],
    ['Google Business Profile','Local search visibility','services/digital/google-business-profile.html'],
    ['Social Media Management','Strategy, content and reporting','services/digital/social-media-management.html'],
    ['Paid Advertising','Campaigns, tracking and landing journeys','services/digital/paid-advertising.html'],
    ['LinkedIn Marketing','B2B visibility and professional audiences','services/digital/linkedin-marketing.html'],
    ['Content Writing','Website copy, blogs and company content','services/digital/content-writing.html'],
    ['Graphic Design','Digital and print visual communication','services/digital/graphic-design.html'],
    ['Telemarketing & Lead Follow-Up','Sales calls and lead progression','services/sales/telemarketing.html'],
    ['Outbound Calling','Calling campaigns and appointment setting','services/sales/outbound-calling.html'],
    ['Market Research','Market and contact research','services/sales/market-research.html'],
    ['Lead Generation','Prospect lists and lead sourcing','services/sales/lead-generation.html'],
    ['Data Capture','Structured data and records','services/outsourcing/data-capture.html'],
    ['Customer Support','Outsourced customer service','services/outsourcing/customer-support.html'],
    ['Managed Contact Centre','Managed support teams and reporting','services/outsourcing/contact-centre.html'],
    ['Virtual Assistance','Dedicated business support','services/outsourcing/business-support.html'],
    ['Website Development','Web design and development','services/technology/website-design.html'],
    ['CRM Setup','Pipelines, records and follow-up workflows','services/technology/crm-setup.html'],
    ['Business Systems','Dashboards and workflow automation','services/technology/business-systems.html'],
    ['Apps & Portals','Customer and staff digital experiences','services/technology/portals-and-apps.html'],
    ['SMEs & Entrepreneurs','Support for growing businesses','who-we-serve/smes-entrepreneurs.html'],
    ['Property & Real Estate','Lead response, listings and CRM','who-we-serve/property-real-estate.html'],
    ['Mining','Data, systems and professional visibility','who-we-serve/mining.html'],
    ['Agriculture','Agribusiness support, data and marketing','who-we-serve/agriculture.html'],
    ['Financial Services','Customer support, CRM and communication','who-we-serve/financial-services.html'],
    ['Travel & Hospitality','Bookings, response and digital presence','who-we-serve/travel-hospitality.html'],
    ['Health & Healthcare','Non-clinical customer and admin support','who-we-serve/healthcare.html'],
    ['Insights & News','Business guides, blogs and industry news','insights.html'],
    ['Free Audits','Website, SEO, social, CX and sales audits','free-audits.html#audit-form'],
    ['Contact NXT Workforce','Book a consultation or send an enquiry','contact.html'],
    ['Privacy Policy','How we collect and use personal information','privacy.html']
  ];

  const render=(q='')=>{
    const s=q.trim().toLowerCase();
    const filtered=items.filter(x=>!s||x.join(' ').toLowerCase().includes(s)).slice(0,10);
    results.innerHTML=filtered.length?filtered.map(x=>`<a class="search-result" href="${prefix+x[2]}"><div><strong>${x[0]}</strong><div style="font-size:11px;color:var(--text);margin-top:3px">${x[1]}</div></div><span>Open</span></a>`).join(''):'<div class="search-empty">No matching pages found. Try a service, sector or topic.</div>';
  };
  const open=()=>{overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');render();setTimeout(()=>input.focus(),80)};
  const close=()=>{overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');input.value=''};
  openBtn.addEventListener('click',open);
  closeBtn?.addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  input.addEventListener('input',()=>render(input.value));
})();

const enquiry = document.querySelector('#nxtLeadForm');
const serviceSelect = enquiry?.querySelector('select[data-field="service"]');
if (serviceSelect) {
  const params = new URLSearchParams(location.search);
  const topic = params.get('service');
  if ([...serviceSelect.options].some(option => option.value === topic)) serviceSelect.value = topic;
  const message = enquiry.querySelector('[data-field="challenge"]');
  const domain = params.get('domain')?.trim();
  if (topic === 'Domain registration' && domain && domain.length <= 253 && message)
    message.value = 'Please check availability and quote registration for ' + domain + '.';
  if (message && topic === 'Monthly data protection')
    message.placeholder = 'Describe your systems and record types. Please leave individual records and ID numbers out.';
}
