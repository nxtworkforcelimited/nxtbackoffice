(() => {
  if(document.querySelector('.nxt-help-dock'))return;
  document.querySelectorAll('#waBtn, #waPanel').forEach(element=>element.remove());
  const dock=document.createElement('div');dock.className='nxt-help-dock';
  dock.innerHTML='<a class="nxt-whatsapp" href="https://wa.me/263790050483?text=Hi%20NXT%20Workforce%2C%20I%20would%20like%20help%20with%20my%20business." target="_blank" rel="noopener" aria-label="Chat with NXT on WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z"/><path d="m8 7 1.3-.2 1 2.4-.9 1a9 9 0 0 0 3.5 3.5l1-.9 2.4 1-.2 1.3c-.2 1.2-1.8 1.5-2.8 1.1a12 12 0 0 1-6.2-6.2C6.7 8.9 6.8 7.2 8 7Z"/></svg><span>WhatsApp</span></a><button type="button" class="nxt-ask-ai" aria-haspopup="dialog" aria-expanded="false" aria-controls="nxt-ai-chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7Z"/></svg>Ask AI</button>';
  const dialog=document.createElement('dialog');dialog.id='nxt-ai-chat';dialog.className='nxt-chat';dialog.setAttribute('aria-labelledby','nxt-chat-title');
  dialog.innerHTML='<div class="nxt-chat-head"><div><span>NXT WORKFORCE</span><h2 id="nxt-chat-title">What does your business need?</h2></div><button type="button" data-chat-close aria-label="Close AI chat">×</button></div><div class="nxt-chat-messages" role="log" aria-live="polite" aria-relevant="additions"><p class="nxt-chat-reply">Hi, I’m NXT’s AI service adviser. Tell me what you’d like to improve, and I’ll help you find the right service.</p></div><div class="nxt-chat-prompts"><button type="button">I need more customers</button><button type="button">Help with WhatsApp replies</button><button type="button">Our admin takes too long</button></div><form class="nxt-chat-form"><label for="nxt-chat-message">Tell us what you need</label><div><textarea id="nxt-chat-message" required maxlength="1500" rows="2" placeholder="For example: we lose track of leads after a WhatsApp enquiry…"></textarea><button type="submit" aria-label="Send message">↑</button></div><p data-chat-status role="status"></p><small>AI suggestions can be imperfect. Avoid sharing confidential information.</small></form><div class="nxt-chat-footer"><button type="button" data-chat-reset>New conversation</button><a href="/#services">Service finder</a><a href="https://wa.me/263790050483" target="_blank" rel="noopener">Talk to a person ↗</a></div>';
  document.body.append(dock,dialog);
  const open=dock.querySelector('button'),form=dialog.querySelector('form'),input=dialog.querySelector('textarea'),status=dialog.querySelector('[data-chat-status]'),messages=dialog.querySelector('.nxt-chat-messages'),send=form.querySelector('button');
  const greeting=messages.firstElementChild.cloneNode(true);let history=[],busy=false,controller=null;
  function addMessage(text,role,services=[]){
    const box=document.createElement('div');box.className=role==='user'?'nxt-chat-user':'nxt-chat-reply';
    const p=document.createElement('p');p.textContent=text;box.append(p);
    for(const service of services){
      if(typeof service.path!=='string'||!/^\/(services\/[-a-z0-9/]+|domains)$/.test(service.path))continue;
      const a=document.createElement('a');a.href=service.path;a.textContent=service.name+' ↗';box.append(a);
    }
    messages.append(box);messages.scrollTop=messages.scrollHeight;
  }
  function reset(){if(busy)return;history=[];messages.replaceChildren(greeting.cloneNode(true));status.textContent='';input.value='';dialog.querySelector('.nxt-chat-prompts').hidden=false;input.focus();}
  open.addEventListener('click',()=>{dialog.showModal();open.setAttribute('aria-expanded','true');input.focus();});
  dialog.querySelector('[data-chat-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{open.setAttribute('aria-expanded','false');open.focus();});
  dialog.querySelector('[data-chat-reset]').addEventListener('click',reset);
  dialog.querySelectorAll('.nxt-chat-prompts button').forEach(b=>b.addEventListener('click',()=>{input.value=b.textContent;form.requestSubmit();}));
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy||!form.reportValidity()||!input.value.trim())return;
    if(history.length>=6){status.textContent='Start a new conversation, or talk to our team to explore this further.';return;}
    const question=input.value.trim();const proposed=[...history,{role:'user',content:question}];
    busy=true;send.disabled=true;dialog.querySelector('[data-chat-reset]').disabled=true;status.textContent='Thinking…';
    addMessage(question,'user');input.value='';dialog.querySelector('.nxt-chat-prompts').hidden=true;
    controller=new AbortController();const timer=setTimeout(()=>controller.abort(),26000);
    try{
      const r=await fetch('/api/public/service-assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:proposed}),signal:controller.signal});
      const result=await r.json();if(!r.ok||typeof result.message!=='string'||!Array.isArray(result.services))throw new Error(result.error||'The AI adviser is temporarily unavailable. Please try again or use WhatsApp.');
      addMessage(result.message,'assistant',result.services);history=[...proposed,{role:'assistant',content:result.message.slice(0,1500)}];status.textContent='';
    }catch(error){status.textContent=error.name==='AbortError'?'The reply took too long. Please try again.':error.message;input.value=question;messages.lastElementChild?.remove();}
    finally{clearTimeout(timer);busy=false;send.disabled=false;dialog.querySelector('[data-chat-reset]').disabled=false;if(dialog.open)input.focus();}
  });
})();
