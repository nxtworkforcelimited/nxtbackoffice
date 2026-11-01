(() => {
  const panel=document.querySelector('#domain-registration'); if(!panel)return;
  const form=panel.querySelector('form'), status=panel.querySelector('#registration-status');
  const title=panel.querySelector('h2'), progress=panel.querySelector('.registration-progress');
  const next=panel.querySelector('[data-reg-next]'), back=panel.querySelector('[data-reg-back]'), submit=panel.querySelector('[data-reg-submit]');
  const steps=[...form.querySelectorAll('[data-reg-step]')]; let active=[], index=0, requestId='', busy=false;
  const input=name=>form.elements.namedItem(name);
  function toggleContact(name,same){const block=form.querySelector('[data-contact-fields="'+name+'"]');block.hidden=same;block.querySelectorAll('input').forEach(el=>el.disabled=same);}
  input('adminSame').addEventListener('change',()=>toggleContact('admin',input('adminSame').checked));
  input('technicalSame').addEventListener('change',()=>toggleContact('technical',input('technicalSame').checked));
  function data(){
    const values=Object.fromEntries(new FormData(form));
    const contact=name=>Object.fromEntries(['name','organisation','physical','postal','city','country','phone','email','fax','handle'].map(key=>[key,values[name+'_'+key]||'']));
    return {requestId,domain:values.domain,owner:contact('owner'),adminSame:input('adminSame').checked,admin:contact('admin'),technicalSame:input('technicalSame').checked,technical:contact('technical'),description:values.description,usage:values.usage,notices:values.notices,consent:input('consent').checked,website:values.website,nameservers:[1,2,3,4].map(i=>({host:values['ns'+i+'_host'],ip:values['ns'+i+'_ip']})).filter(n=>n.host||n.ip)};
  }
  function render(){
    const step=active[index];steps.forEach(el=>el.hidden=el!==step);progress.textContent='Step '+(index+1)+' of '+active.length;
    back.hidden=index===0;next.hidden=index===active.length-1;submit.hidden=!next.hidden;status.textContent='';
    if(step.dataset.regStep==='review'){
      const v=data(),list=form.querySelector('.registration-summary');list.replaceChildren();
      const pairs=[['Domain',v.domain],['Domain owner',v.owner.name+' · '+v.owner.organisation],['Contact',v.owner.email+' · '+v.owner.phone],['Owner address',[v.owner.physical,v.owner.city,v.owner.country].join(', ')],['Postal address',v.owner.postal],['Billing contact',v.adminSame?'Same as domain owner':v.admin.name+' · '+v.admin.email],['Organisation',v.description],['Domain use',v.usage],['Notices address',v.notices]];
      if(v.domain.endsWith('.co.zw'))pairs.push(['Technical contact',v.technicalSame?'Same as billing contact':v.technical.name+' · '+v.technical.email],['Nameservers',v.nameservers.map(ns=>ns.host+' ('+ns.ip+')').join('; ')]);
      for(const [label,value] of pairs){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;list.append(dt,dd);}
    }
    title.focus({preventScroll:true});panel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  }
  function start(domain){
    if(busy)return;
    domain=domain.trim().toLowerCase().replace(/^www\./,'');
    if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:co\.zw|com|net|org|co\.uk|co\.za|co\.com)$/.test(domain))return false;
    // Preserve contact details when trying a different name, but require new consent.
    input('domain').value=domain;input('consent').checked=false;requestId=crypto.randomUUID();title.textContent=domain;
    const local=domain.endsWith('.co.zw');active=steps.filter(s=>local||!['technical','nameservers'].includes(s.dataset.regStep));
    steps.forEach(s=>s.querySelectorAll('input').forEach(el=>el.disabled=!active.includes(s)));
    toggleContact('admin',input('adminSame').checked);if(local)toggleContact('technical',input('technicalSame').checked);
    form.querySelector('[data-zispa-terms]').hidden=!local;
    form.hidden=false;panel.hidden=false;index=0;render();return true;
  }
  document.addEventListener('nxt-register-domain',e=>start(e.detail.domain));
  const direct=document.querySelector('#domain-direct');
  direct.addEventListener('submit',e=>{e.preventDefault();if(!start(direct.elements.domain.value))direct.querySelector('[data-direct-status]').textContent='Enter a full domain such as yourbusiness.co.zw or yourbusiness.com.';});
  next.addEventListener('click',()=>{for(const el of active[index].querySelectorAll('input'))if(!el.disabled&&!el.reportValidity())return;index++;render();});
  back.addEventListener('click',()=>{if(!busy&&index>0){index--;render();}});
  panel.querySelector('[data-reg-cancel]').addEventListener('click',()=>{if(busy)return;panel.hidden=true;document.querySelector('#domain-name').focus();document.querySelector('#domain-search').scrollIntoView({block:'center'});});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;
    for(const step of active)for(const el of step.querySelectorAll('input'))if(!el.disabled&&!el.checkValidity()){index=active.indexOf(step);render();el.reportValidity();return;}
    busy=true;submit.disabled=true;back.disabled=true;submit.textContent='Sending…';status.textContent='Sending your application…';form.setAttribute('aria-busy','true');
    try {
      const r=await fetch('/api/public/domain-registration',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data()),signal:AbortSignal.timeout(30000)});
      const body=await r.json();
      if(r.ok&&body.prepared&&typeof body.attachment==='string'){
        const download=document.createElement('a');download.className='btn primary';download.textContent='Download application';
        const objectUrl=URL.createObjectURL(new Blob([body.attachment],{type:'text/plain;charset=us-ascii'}));
        download.href=objectUrl;download.download=body.filename;
        download.addEventListener('click',()=>setTimeout(()=>URL.revokeObjectURL(objectUrl),60000),{once:true});
        const email=document.createElement('a');email.className='btn';email.textContent='Email DNS team';
        email.href='mailto:dns@nxt-workforce.com?subject='+encodeURIComponent(body.domain)+'&body='+encodeURIComponent('Please register '+body.domain+'. I have attached the completed application.');
        status.replaceChildren(document.createTextNode(body.message),document.createElement('br'),download,document.createTextNode(' '),email);
        progress.textContent='Application prepared — email required';
        return;
      }
      if(!r.ok||!body.ok)throw new Error(body.error||'We could not send your application. Please try again.');
      steps.forEach(s=>s.hidden=true);next.hidden=true;back.hidden=true;submit.hidden=true;
      progress.textContent='Application received';status.textContent=body.message;title.focus();
    } catch(error){status.textContent=error.name==='TimeoutError'?'The request timed out. Please retry; your details are still here.':error.message;}
    finally {busy=false;submit.disabled=false;back.disabled=false;submit.textContent='Send registration';form.removeAttribute('aria-busy');}
  });
})();
