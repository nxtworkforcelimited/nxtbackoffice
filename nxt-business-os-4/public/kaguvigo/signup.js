(() => {
 const form=document.getElementById('signup-form');
 let saving=false;
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(saving)return;saving=true;
  const fields=new FormData(form),fieldset=form.querySelector('fieldset'),button=form.querySelector('button[type="submit"]'),error=document.getElementById('signup-error');
  error.hidden=true;error.textContent='';fieldset.disabled=true;button.textContent='Saving your details…';form.setAttribute('aria-busy','true');
  try{
   const response=await fetch('/api/public/kaguvigo/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:fields.get('name'),phone:fields.get('phone'),email:fields.get('email'),interest:fields.get('interest'),consent:fields.get('consent')==='yes',website:fields.get('website')||''}),signal:AbortSignal.timeout(20000)});
   const result=await response.json().catch(()=>null);
   if(!response.ok||result?.ok!==true)throw new Error(result?.error||'We couldn’t save your details. Please try again.');
   document.getElementById('page').replaceChildren(document.getElementById('thank-you-template').content.cloneNode(true));
   document.title='Thank you — KaguviGo';window.scrollTo({top:0,behavior:'instant'});document.querySelector('.thank-you-title').focus();
  }catch(cause){error.textContent=cause instanceof Error&&!['TypeError','TimeoutError'].includes(cause.name)?cause.message:'The connection was interrupted. Please try again — your details won’t be saved twice.';error.hidden=false;}
  finally{saving=false;fieldset.disabled=false;button.textContent='Count me in';form.setAttribute('aria-busy','false');}
 });
})();
