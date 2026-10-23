import {NextRequest} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {v6Files,v6UrlByFile,slugForUrl} from '@/lib/v6-page-map';

const sourceBase='https://lambent-dango-30e63f.netlify.app/';
const htmlEscape=(value:string)=>value.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));

function cleanPath(value:string){
  const raw=value.split('#')[0].split('?')[0];
  const parts:string[]=[];
  for(const part of raw.split('/')){
    if(!part||part==='.')continue;
    if(part==='..')parts.pop(); else parts.push(part);
  }
  return parts.join('/');
}
function rewriteLinks(html:string,currentFile:string){
  html=html.replace(/href="(?:\.\.\/)*styles\.css"/gi,'href="'+sourceBase+'styles.css"');
  html=html.replace(/src="(?:\.\.\/)*app\.js"/gi,'src="'+sourceBase+'app.js"');
  html=html.replace(/(src|href)="(?:\.\.\/)*assets\/([^"]+)"/gi,(_m,attr,asset)=>attr+'="'+sourceBase+'assets/'+asset+'"');
  const currentDir=currentFile.includes('/')?currentFile.slice(0,currentFile.lastIndexOf('/')+1):'';
  html=html.replace(/href="([^"]+)"/gi,(full,href)=>{
    if(!href||href.startsWith('#')||/^(https?:|mailto:|tel:|javascript:|\/\/)/i.test(href))return full;
    if(href==='/my'||href.startsWith('/my?'))return 'href="/login"';
    if(href.startsWith('/'))return full;
    const hash=href.includes('#')?'#'+href.split('#').slice(1).join('#'):'';
    const queryPart=href.split('#')[0];
    const query=queryPart.includes('?')?'?'+queryPart.split('?').slice(1).join('?'):'';
    const rel=queryPart.split('?')[0];
    const resolved=cleanPath(currentDir+rel);
    const clean=v6UrlByFile.get(resolved as never);
    return clean?'href="'+clean+query+hash+'"':full;
  });
  html=html.replace(/<a([^>]*?)href="[^"]*"([^>]*)>(\s*)Book a Consultation(\s*)<\/a>/gi,'<a$1href="/book"$2>$3Book a Consultation$4</a>');
  return html;
}
function patchCms(html:string,row:any){
  if(!row)return html;
  const title=String(row.title||'').trim(),description=String(row.description||'').trim(),content=row.content||{};
  if(title)html=html.replace(/<title>[\s\S]*?<\/title>/i,'<title>'+htmlEscape(title)+'</title>');
  if(description){
    const escaped=htmlEscape(description);
    if(/<meta[^>]+name=["']description["'][^>]*>/i.test(html))html=html.replace(/<meta[^>]+name=["']description["'][^>]*>/i,'<meta name="description" content="'+escaped+'"/>');
    else html=html.replace('</head>','<meta name="description" content="'+escaped+'"/></head>');
  }
  const heading=String(content.heading||'').trim();
  const body=String(content.body||'').trim();
  if(heading)html=html.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/i,'<h1$1>'+htmlEscape(heading)+'</h1>');
  if(body)html=html.replace(/(<h1[^>]*>[\s\S]*?<\/h1>[\s\S]{0,700}?<p[^>]*>)[\s\S]*?(<\/p>)/i,'$1'+htmlEscape(body)+'$2');
  const cta=String(content.cta_label||'').trim(),ctaHref=String(content.cta_href||'').trim();
  if(cta||ctaHref){
    html=html.replace(/(<div class="hero-actions"[^>]*>[\s\S]*?<a)([^>]*)(>)([\s\S]*?)(<\/a>)/i,(_m,start,attrs,gt,label,end)=>{
      let next=attrs;
      if(ctaHref)next=/href="[^"]*"/i.test(next)?next.replace(/href="[^"]*"/i,'href="'+htmlEscape(ctaHref)+'"'):next+' href="'+htmlEscape(ctaHref)+'"';
      return start+next+gt+(cta?htmlEscape(cta):label)+end;
    });
  }
  return html;
}
function attachFormBridge(html:string){
  if(!html.includes('id="nxtLeadForm"'))return html;
  html=html.replace('action="/website/form/"','action="/api/public/enquiry"');
  const script=`<script>
document.addEventListener('DOMContentLoaded',function(){
 const form=document.getElementById('nxtLeadForm');if(!form)return;
 form.addEventListener('submit',async function(e){
  e.preventDefault();const btn=form.querySelector('button[type="submit"]');const old=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Sending…';}
  const hidden=form.querySelector('input[name="name"]');
  const payload={type:hidden&&hidden.value==='Free Audit Request'?'free_audit':'enquiry',name:form.querySelector('[name="contact_name"]')?.value||'',company:form.querySelector('[name="partner_name"]')?.value||'',email:form.querySelector('[name="email_from"]')?.value||'',phone:form.querySelector('[name="phone"]')?.value||'',service:form.querySelector('[data-field="service"]')?.value||'',audit_type:hidden&&hidden.value==='Free Audit Request'?(form.querySelector('[data-field="service"]')?.value||''):'',industry:form.querySelector('[data-field="industry"]')?.value||'',contact_method:form.querySelector('[data-field="contact_method"]')?.value||'',message:form.querySelector('[data-field="challenge"]')?.value||'',website:''};
  let status=document.getElementById('nxtBridgeStatus');if(!status){status=document.createElement('p');status.id='nxtBridgeStatus';form.appendChild(status);}
  try{const r=await fetch('/api/public/enquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'Submission failed');form.reset();status.style.color='#2f6b45';status.textContent=payload.type==='free_audit'?'Thank you. Your free audit request has been received. We will respond within 24 hours.':'Thank you. Your enquiry has been received. We will respond within 24 hours.';}catch(err){status.style.color='#9b2c2c';status.textContent='We could not submit this form. Please email hello@nxt-workforce.com or WhatsApp +263 79 005 0483.';}finally{if(btn){btn.disabled=false;btn.textContent=old||'Submit';}}
 });
});
<\/script>`;
  return html.replace('</body>',script+'</body>');
}

export async function GET(req:NextRequest){
  const path=req.nextUrl.searchParams.get('path')||'/';
  const file=(v6Files as Record<string,string>)[path];
  if(!file)return new Response('Not found',{status:404});
  const upstream=await fetch(sourceBase+file,{cache:'no-store'});
  if(!upstream.ok)return new Response('Website source unavailable',{status:502});
  let html=await upstream.text();
  html=rewriteLinks(html,file);
  html=attachFormBridge(html);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(url&&key){
    try{
      const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
      const {data}=await db.from('website_pages').select('title,description,content,status').eq('slug',slugForUrl(path)).eq('status','published').maybeSingle();
      html=patchCms(html,data);
    }catch{}
  }
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-NXT-Source':'v6-migration-bridge'}});
}
