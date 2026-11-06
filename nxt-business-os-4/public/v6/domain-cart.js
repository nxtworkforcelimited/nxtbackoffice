(() => {
  const key='nxt-domain-cart-v1',pattern=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:co\.zw|com|co\.uk|co\.com|co\.za|net|org)$/;
  let domains=[];
  try {const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))domains=[...new Set(saved.filter(d=>typeof d==='string'&&pattern.test(d)))].slice(0,5);}catch{}
  const changed=()=>{try{localStorage.setItem(key,JSON.stringify(domains));}catch{}document.querySelectorAll('[data-cart-count]').forEach(el=>el.textContent=String(domains.length));document.dispatchEvent(new Event('nxt-cart-changed'));};
  window.nxtDomainCart={get:()=>[...domains],remove:d=>{domains=domains.filter(x=>x!==d);changed();},clear:()=>{domains=[];changed();}};
  document.addEventListener('nxt-register-domain',event=>{
    const d=event.detail?.domain;if(!pattern.test(d))return;
    const status=document.querySelector('#domain-status');
    if(!domains.includes(d)){if(domains.length>=5){status.textContent='Your cart holds up to five domains.';return;}domains.push(d);changed();}
    status.replaceChildren(document.createTextNode(d+' added. '));const link=document.createElement('a');link.href='/domain-checkout';link.textContent='View cart →';status.append(link);
    document.querySelectorAll('.domain-result').forEach(el=>{if(el.querySelector('h3')?.textContent===d){const b=el.querySelector('button');if(b)b.textContent='Added to cart';}});
  });
  changed();
})();
