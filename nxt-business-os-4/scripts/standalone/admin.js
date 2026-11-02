let session;try{session=JSON.parse(sessionStorage.getItem('nxt-editor')||'null')}catch{}let allPosts=[];
const q=s=>document.querySelector(s);const info=t=>q('#admin-status').textContent=t;
async function authFetch(path,opts={}){if(!session||session.expires_at*1000<Date.now()){throw new Error('Your session has expired. Please sign in again.');}return rest(path,{...opts,headers:{Authorization:'Bearer '+session.access_token,...opts.headers}});}
function logout(){session=null;sessionStorage.removeItem('nxt-editor');q('#workspace').classList.add('hidden');q('#admin-login').classList.remove('hidden');}
async function workspace(){try{const roles=await authFetch('memberships?select=role,tenants!inner(slug)&tenants.slug=eq.nxt-workforce&user_id=eq.'+session.user.id);if(!roles.some(r=>['owner','admin'].includes(r.role)))throw new Error('This account does not have website publishing access.');q('#workspace').classList.remove('hidden');q('#admin-login').classList.add('hidden');allPosts=await authFetch('nxt_website_posts?select=*&order=created_at.desc');q('#admin-posts').innerHTML=allPosts.map((p,i)=>'<div class="admin-row"><span>'+safe(p.title)+'<br><small>'+ (p.published?'Published':'Draft')+'</small></span><button type="button" data-edit="'+i+'">Edit</button></div>').join('')||'No articles yet.';q('#admin-posts').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const p=allPosts[+b.dataset.edit],f=q('#post-editor');for(const n of ['id','title','slug','category','excerpt','body'])f.elements[n].value=p[n];f.elements.published.checked=p.published;f.scrollIntoView({behavior:'smooth',block:'start'});});const en=await authFetch('nxt_website_enquiries?select=*&order=created_at.desc&limit=100');q('#admin-enquiries').innerHTML=en.map(e=>'<div class="admin-row" style="display:block"><b>'+safe(e.name)+'</b><p>'+safe(e.email)+'<br>'+safe(e.service)+'</p><p style="white-space:pre-wrap">'+safe(e.message)+'</p><small>'+safe(new Date(e.created_at).toLocaleDateString())+'</small></div>').join('')||'No enquiries yet.';await readSubscribers(0);}catch(e){logout();q('#admin-login .status').textContent=e.message;}}
const loginForm = q('#admin-login');
const resetLink = document.createElement('a');
resetLink.href = 'mailto:hello@nxt-workforce.com?subject=NXT%20Business%20OS%20password%20reset';
resetLink.textContent = 'Forgot password? Email NXT for a reset';
loginForm.querySelector('.status').before(resetLink);

async function loginError(response) {
  const body = await response.json().catch(() => ({}));
  switch (body?.error_code || body?.code) {
    case 'invalid_credentials':
      return 'The email and password did not match. Use your NXT Business OS email and password, or use the password-reset link.';
    case 'email_not_confirmed':
      return 'Confirm your NXT Business OS email address, then sign in again.';
    case 'over_request_rate_limit':
      return 'Too many sign-in attempts. Wait a few minutes before trying again.';
  }
  if (response.status === 429) return 'Too many sign-in attempts. Wait a few minutes before trying again.';
  return 'The editor could not complete sign-in. Try again or contact hello@nxt-workforce.com.';
}

loginForm.onsubmit = async event => {
  event.preventDefault();
  const button = loginForm.querySelector('button');
  const status = loginForm.querySelector('.status');
  const fields = loginForm.elements;
  button.disabled = true;
  status.textContent = 'Signing in…';
  try {
    const response = await fetch(API + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: {apikey: KEY, 'Content-Type': 'application/json'},
      body: JSON.stringify({email: fields.email.value.trim(), password: fields.password.value})
    });
    if (!response.ok) {
      status.textContent = await loginError(response);
      return;
    }
    session = await response.json();
    session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
    sessionStorage.setItem('nxt-editor', JSON.stringify(session));
    fields.password.value = '';
    await workspace();
  } catch {
    status.textContent = 'Could not finish signing in. Check your connection and try again.';
  } finally {
    button.disabled = false;
  }
};
q('#signout').onclick=async()=>{if(session)await fetch(API+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token}}).catch(()=>{});logout();};
q('#new-post').onclick=()=>{q('#post-editor').reset();q('#post-editor').elements.id.value='';q('#post-editor').scrollIntoView({behavior:'smooth'});};
q('#post-editor').onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  const fields = form.elements;
  const button = form.querySelector('button');
  const status = form.querySelector('.status');
  button.disabled = true;
  try {
    const post = {};
    for (const name of ['title', 'slug', 'category', 'excerpt', 'body']) {
      post[name] = fields[name].value.trim();
    }
    post.published = fields.published.checked;
    const query = new URLSearchParams({select: 'id'});
    const id = fields.id.value;
    if (id) query.set('id', 'eq.' + id);
    const saved = await authFetch('nxt_website_posts?' + query, {
      method: id ? 'PATCH' : 'POST',
      headers: {Prefer: 'return=representation'},
      body: JSON.stringify(post)
    });
    if (!saved?.[0]?.id) throw new Error('Could not save this article. Refresh the list and try again.');
    fields.id.value = saved[0].id;
    status.textContent = post.published ? 'Article published.' : 'Draft saved.';
    await workspace();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
let subscriberOffset = 0;
let subscriberRequest = 0;
async function readSubscribers(offset) {
  const request = ++subscriberRequest;
  const rpc = q("#news-list").value === "company" ? "nxt_company_newsletter_list" : "nxt_newsletter_list";
  const prev = q('#news-prev');
  const next = q('#news-next');
  const list = q('#admin-subscribers');
  prev.disabled = next.disabled = true;
  list.textContent = 'Loading subscribers…';
  try {
    const batch = await authFetch('rpc/' + rpc, {
      method: 'POST', headers: {Prefer:'return=representation'}, body: JSON.stringify({p_offset:offset})
    });
    if (request !== subscriberRequest) return;
    subscriberOffset = offset;
    list.replaceChildren();
    for (const subscriber of batch) {
      const row = document.createElement('p');
      row.textContent = subscriber.email + ' · ' + new Date(subscriber.joined_at).toLocaleDateString();
      list.append(row);
    }
    if (!batch.length) list.textContent = offset ? 'No further subscribers.' : 'No newsletter signups yet.';
    prev.disabled = !offset;
    next.disabled = batch.length < 100;
  } catch {
    if (request !== subscriberRequest) return;
    list.textContent = 'Could not load newsletter signups.';
    prev.disabled = !subscriberOffset;
  }
}
q('#news-list').onchange = () => readSubscribers(0);
q('#news-prev').onclick = () => readSubscribers(Math.max(0, subscriberOffset - 100));
q('#news-next').onclick = () => readSubscribers(subscriberOffset + 100);
if(session)workspace();

