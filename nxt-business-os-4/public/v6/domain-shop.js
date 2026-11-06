(() => {
  const root=document.querySelector('[data-shop]');if(!root)return;
  const q=s=>root.querySelector(s),qa=s=>[...root.querySelectorAll(s)],cart=window.nxtDomainCart;
  const status=q('#shop-status'),isAccount=root.dataset.shop==='account';
  let user=null,prices=[],paymentsEnabled=false,mode='login',step=0,order=null,busy=false;
  let requestId=crypto.randomUUID(),details=null;
  const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
  const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  const api=async(path,body,refresh=true)=>{
    const r=await fetch('/api/public/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',cache:'no-store'});
    const b=await r.json().catch(()=>({}));
    if(r.status===401&&refresh&&!path.startsWith('domain-account')){await api('domain-account',{action:'refresh'},false);return api(path,body,false);}
    if(!r.ok)throw new Error(b.error||'Please try again.');return b;
  };
  const price=d=>prices.find(p=>p.extension===d.slice(d.indexOf('.')+1));
  const cartReady=()=>cart.get().length>0&&cart.get().every(d=>price(d)?.enabled&&Number.isInteger(price(d)?.registration_cents)&&Number.isInteger(price(d)?.renewal_cents));
  function summary(){
    const target=q('[data-order-summary]');if(!target)return;target.replaceChildren();
    const items=order?.items||cart.get().map(domain=>({domain,registration_cents:price(domain)?.enabled?price(domain).registration_cents:null,renewal_cents:price(domain)?.enabled?price(domain).renewal_cents:null}));
    for(const item of items){const row=el('div',undefined,'shop-summary-row');row.append(el('span',item.domain),el('strong',item.registration_cents==null?'Price pending':money(item.registration_cents)));target.append(row);if(item.renewal_cents!=null)target.append(el('p','Renewal: '+money(item.renewal_cents)+' / year','shop-help'));}
    const total=order?.total_cents??(cartReady()?items.reduce((n,i)=>n+i.registration_cents,0):null);
    target.append(el('div',total===null?'Total pending':money(total),'shop-total'));
    if(total===null)target.append(el('p','Online prices are being prepared. You can review your details, but payment is not open yet.','shop-help'));
  }
  function renderCart(){
    const target=q('[data-cart-items]');if(!target)return;target.replaceChildren();
    if(!cart.get().length)target.append(el('p','Your cart is empty. Find a domain to get started.'));
    for(const domain of cart.get()){
      const row=el('article',undefined,'shop-item'),copy=el('div'),p=price(domain);
      copy.append(el('h3',domain),el('p','1 year · Domain registration'));
      if(p?.enabled)copy.append(el('p',money(p.registration_cents)+' today · '+money(p.renewal_cents)+' yearly renewal'));
      const remove=el('button','Remove','shop-text-link');remove.type='button';remove.setAttribute('aria-label','Remove '+domain);remove.onclick=()=>{cart.remove(domain);requestId=crypto.randomUUID();};row.append(copy,remove);target.append(row);
    }
    const next=q('[data-next="1"]');if(next)next.disabled=!cart.get().length;summary();
  }
  function showStep(n){
    if(n>0&&!cart.get().length&&!order)return;step=n;status.textContent='';
    qa('[data-shop-step]').forEach(e=>e.hidden=Number(e.dataset.shopStep)!==n);
    qa('[data-progress]').forEach(e=>{if(Number(e.dataset.progress)===n)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});
    q('[data-shop-step="'+n+'"] h2')?.focus();
    if(n===2){q('[data-place-order]').disabled=!cartReady();summary();}
  }
  function signedIn(){
    qa('[data-shop-auth]').forEach(e=>e.hidden=!!user);
    qa('[data-customer-form],[data-account-orders]').forEach(e=>e.hidden=!user);
    qa('[data-customer-email]').forEach(e=>e.textContent=user?.email||'');
    if(user&&q('[name="billing_email"]')&&!q('[name="billing_email"]').value)q('[name="billing_email"]').value=user.email;
  }
  async function loadUser(){
    try {let r;try{r=await api('domain-account');}catch{await api('domain-account',{action:'refresh'},false);r=await api('domain-account');}user=r.user;}catch{user=null;}signedIn();
    if(isAccount&&user)await loadOrders();
  }
  async function loadOrders(){
    const target=q('[data-orders-list]');target.replaceChildren(el('p','Loading your orders…'));
    try {const data=await api('domain-checkout?action=orders');paymentsEnabled=data.paymentsEnabled;target.replaceChildren();
      if(!data.orders.length)target.append(el('p','No orders yet. Your next domain starts with a search.'));
      for(const o of data.orders){const item=el('article',undefined,'shop-order');item.append(el('h3',o.items.map(i=>i.domain).join(', ')),el('small','Order '+o.id),el('p',money(o.total_cents)+' · '+new Date(o.created_at).toLocaleDateString()));
        item.append(el('span',o.payment_status==='paid'?'Payment received':o.payment_status==='refunded'?'Refunded':'Awaiting payment','shop-badge'),el('span',({pending:'Awaiting registration',processing:'Registration in progress',registered:'Registered',cancelled:'Cancelled',needs_attention:'NXT is reviewing your order'})[o.fulfilment_status]||'Processing','shop-badge'));
        if(o.payment_status==='unpaid'&&o.fulfilment_status!=='cancelled'){const a=el('a','View payment','btn');a.href='/domain-checkout?order='+encodeURIComponent(o.id);item.append(el('p'),a);}target.append(item);
      }
    }catch(e){target.replaceChildren(el('p',e.message));}
  }
  qa('[data-next]').forEach(b=>b.onclick=()=>showStep(Number(b.dataset.next)));
  qa('[data-auth-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.authMode;qa('[data-auth-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));q('[data-signup-only]').hidden=mode!=='signup';q('[name="terms"]').required=mode==='signup';q('[name="password"]').minLength=mode==='signup'?12:1;q('[name="password"]').autocomplete=mode==='signup'?'new-password':'current-password';q('[data-auth-submit]').textContent=mode==='signup'?'Create account':'Sign in';q('[data-auth-status]').textContent='';});
  q('#customer-auth')?.addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;const f=e.target;if(!f.reportValidity())return;busy=true;const button=q('[data-auth-submit]');button.disabled=true;
    try {const data=await api('domain-account',{action:mode,email:f.email.value,password:f.password.value,terms:f.terms.checked},false);f.password.value='';q('[data-auth-status]').textContent=data.message||'';q('[data-resend]').hidden=!data.confirmationRequired;if(data.user){user=data.user;signedIn();if(isAccount)await loadOrders();else if(new URLSearchParams(location.search).has('order'))await loadExistingOrder();}}
    catch(e){q('[data-auth-status]').textContent=e.message;}finally{busy=false;button.disabled=false;}
  });
  q('[data-resend]')?.addEventListener('click',async()=>{const b=q('[data-resend]');b.disabled=true;try{const data=await api('domain-account',{action:'resend',email:q('#customer-auth').email.value});q('[data-auth-status]').textContent=data.message;}catch(e){q('[data-auth-status]').textContent=e.message;}finally{b.disabled=false;}});
  qa('[data-signout]').forEach(b=>b.onclick=async()=>{try{await api('domain-account',{action:'logout'},false);}catch{}user=null;order=null;signedIn();q('[data-orders-list]')?.replaceChildren();if(!isAccount)showStep(1);});
  const form=q('#checkout-details');
  function ownerFields(){if(!form)return;const same=form.ownerSame.checked;q('[data-other-owner]').hidden=same;q('[data-other-owner]').querySelectorAll('input').forEach(i=>i.disabled=same);}
  form?.ownerSame.addEventListener('change',ownerFields);ownerFields();
  form?.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity()||!user)return;
    const contact=prefix=>Object.fromEntries(['name','organisation','email','phone','physical','postal','city','country'].map(k=>[k,form.elements[prefix+'_'+k].value.trim()]));
    details={billing:contact('billing'),ownerSame:form.ownerSame.checked,owner:form.ownerSame.checked?contact('billing'):contact('owner'),description:form.description.value.trim(),usage:form.usage.value.trim(),notices:form.notices.value.trim(),notes:form.notes.value.trim()};
    requestId=crypto.randomUUID();const review=q('[data-review-details]');review.replaceChildren();const dl=el('dl');for(const [label,value] of [['Domain owner',details.owner.name],['Organisation',details.owner.organisation],['Contact',details.owner.email],['Billing contact',details.billing.name],['Address',[details.owner.physical,details.owner.city,details.owner.country].join(', ')],['Core business',details.description],['Domain use',details.usage]])dl.append(el('dt',label),el('dd',value));review.append(dl);showStep(2);
  });
  q('#place-domain-order')?.addEventListener('submit',async e=>{e.preventDefault();if(busy||!e.target.reportValidity()||!cartReady()||!details)return;busy=true;const b=q('[data-place-order]');b.disabled=true;status.textContent='Checking availability and saving your order…';
    try{const data=await api('domain-checkout',{requestId,domains:cart.get(),details:{...details,consent:true}});order=data.order;paymentsEnabled=data.paymentsEnabled;cart.clear();showPayment();}catch(e){status.textContent=e.message;}finally{busy=false;b.disabled=!cartReady();}
  });
  function showPayment(){showStep(3);summary();q('[data-order-reference]').textContent='Order '+order.id;q('#omari-auth').hidden=order.payment_status==='paid'||!paymentsEnabled;q('#omari-pay').hidden=true;q('[data-check-payment]').hidden=true;q('[data-payment-status]').textContent=order.payment_status==='paid'?'Payment received. NXT will now complete your domain registration.':paymentsEnabled?'Pay '+money(order.total_cents)+' using your Omari wallet.':'Your order is saved. Omari payments are not open yet; no money has been taken.';}
  async function payment(action,values={}){
    if(busy||!order)return;busy=true;qa('#omari-auth button,#omari-pay button,[data-check-payment]').forEach(b=>b.disabled=true);
    try{const data=await api('domain-payment',{action,orderId:order.id,...values});q('[data-payment-status]').textContent=data.message||'';
      if(data.paid){order=data.order;showPayment();}
      else if(data.otpSent){q('#omari-auth').hidden=true;q('#omari-pay').hidden=false;q('#omari-pay input').focus();}
      else{q('#omari-auth').hidden=true;q('#omari-pay').hidden=true;}
      q('[data-check-payment]').hidden=!!data.paid;
    }catch(e){q('[data-payment-status]').textContent=e.message;q('[data-check-payment]').hidden=false;}
    finally{busy=false;qa('#omari-auth button,#omari-pay button,[data-check-payment]').forEach(b=>b.disabled=false);}
  }
  q('#omari-auth')?.addEventListener('submit',e=>{e.preventDefault();if(e.target.reportValidity())payment('auth',{msisdn:e.target.msisdn.value.trim()});});
  q('#omari-pay')?.addEventListener('submit',e=>{e.preventDefault();if(e.target.reportValidity()){const otp=e.target.otp.value.trim();e.target.otp.value='';payment('pay',{otp});}});
  q('[data-check-payment]')?.addEventListener('click',()=>payment('status'));
  async function loadExistingOrder(){const id=new URLSearchParams(location.search).get('order');if(!id)return;if(!user){qa('[data-shop-step]').forEach(e=>e.hidden=e.dataset.shopStep!=='1');return;}
    try{const data=await api('domain-checkout?action=orders');order=data.orders.find(o=>o.id===id);if(!order)throw new Error('Order not found in your account.');paymentsEnabled=data.paymentsEnabled;showPayment();}catch(e){status.textContent=e.message;}
  }
  document.addEventListener('nxt-cart-changed',renderCart);
  (async()=>{renderCart();if(!isAccount)showStep(0);try{const config=await api('domain-checkout');prices=config.prices;paymentsEnabled=config.paymentsEnabled;renderCart();}catch(e){status.textContent=e.message;}await loadUser();if(!isAccount)await loadExistingOrder();})();
})();
