'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import type {Workspace} from '@/lib/types';
import {analyzePost,outline,publishBlockers,renderMarkdown,seoScore,slugify,snippet,wordCount,type PostLike} from '@/lib/blog';
import {Bold,Italic,Heading2,Heading3,List,ListOrdered,Quote,Link2,ImagePlus,Copy,Archive,RotateCcw} from 'lucide-react';

type Post=PostLike&{
 id?:string;client_id:string|null;category:string;tags:string[];author_name:string;
 status:'draft'|'review'|'published'|'archived';publish_at:string|null;published_at?:string|null;updated_at?:string;
};
type Client={id:string;title:string};
const blank:Post={title:'',slug:'',h1:'',excerpt:'',body:'',focus_keyword:'',hero_path:null,hero_alt:'',og_image_path:null,meta_title:'',meta_description:'',canonical_url:'',client_id:null,category:'',tags:[],author_name:'',status:'draft',publish_at:null};
const sample:Post[]=[{...blank,id:'s1',title:'Why every Zimbabwean business needs a website',slug:'why-zimbabwean-business-needs-website',excerpt:'Customers search online first. Here is how a website wins them.',body:'## Customers search first\n\nMost buyers look online before they call.\n\n### Trust\n\nA clear website builds trust.\n\n## What to do next\n\nStart with a simple page.',focus_keyword:'business website',meta_title:'Why Every Zimbabwean Business Needs a Website',meta_description:'Customers search online first. Learn how a simple website builds trust and brings new customers to your Zimbabwean business.',status:'draft'}];

const statusLabel={draft:'Draft',review:'In review',published:'Published',archived:'Archived'} as const;
const pill=(n:number)=>n>=80?'met':n>=55?'soon':'overdue';
const toLocalInput=(iso:string|null)=>{if(!iso)return '';const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';const p=(n:number)=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());};

export default function BlogEditor({workspace,demo=false}:{workspace:Workspace;demo?:boolean}){
 const [posts,setPosts]=useState<Post[]>(demo?sample:[]),[clients,setClients]=useState<Client[]>([]),[canPublish,setCanPublish]=useState(demo),[site,setSite]=useState(demo?'nxt-workforce':''),[imagesBase,setImagesBase]=useState('');
 const [sel,setSel]=useState<Post|null>(null),[saved,setSaved]=useState(''),[tab,setTab]=useState<'write'|'preview'>('write'),[slugTouched,setSlugTouched]=useState(false);
 const [filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[showFeed,setShowFeed]=useState(false);
 const area=useRef<HTMLTextAreaElement>(null);
 const base='/api/blog?workspace='+workspace.id;
 const origin=typeof window!=='undefined'?window.location.origin:'';
 const img=(path:string|null)=>path&&imagesBase?imagesBase+path.split('/').map(encodeURIComponent).join('/'):'';

 async function load(){
  const r=await fetch(base,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);
  setPosts(b.posts);setClients(b.clients);setCanPublish(Boolean(b.can_publish));setSite(b.site||'');setImagesBase(b.images_base||'');
 }
 useEffect(()=>{if(!demo)load().catch(e=>setError(e.message));},[workspace.id,demo]);// eslint-disable-line react-hooks/exhaustive-deps
 async function post(body:Record<string,unknown>){
  const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),b=await r.json();
  if(!r.ok)throw Error(b.error);return b;
 }
 const dirty=sel!==null&&JSON.stringify(sel)!==saved;
 const checks=useMemo(()=>sel?analyzePost(sel):[],[sel]);
 const score=seoScore(checks),heads=useMemo(()=>sel?outline(sel.body):[],[sel]);
 const words=sel?wordCount(sel.body):0;
 const html=useMemo(()=>sel&&tab==='preview'?renderMarkdown(sel.body):'',[sel,tab]);
 const rows=posts.filter(p=>(filter==='all'?p.status!=='archived':p.status===filter)&&(p.title+' '+p.slug).toLowerCase().includes(search.toLowerCase()));

 function open(p:Post){setSel({...p});setSaved(JSON.stringify(p));setSlugTouched(true);setTab('write');setError('');setNotice('');}
 function fresh(){const p={...blank,author_name:''};setSel(p);setSaved(JSON.stringify(p));setSlugTouched(false);setTab('write');setError('');setNotice('');}
 function back(){if(dirty&&!window.confirm('You have unsaved changes. Leave without saving?'))return;setSel(null);}
 function up<K extends keyof Post>(k:K,v:Post[K]){setSel(s=>s?{...s,[k]:v}:s);}
 function setTitle(t:string){setSel(s=>s?{...s,title:t,...(slugTouched||s.id?{}:{slug:slugify(t)})}:s);}

 function edit(fn:(text:string,start:number,end:number)=>{text:string;start:number;end:number}){
  const el=area.current;if(!el||!sel)return;
  const r=fn(sel.body,el.selectionStart,el.selectionEnd);up('body',r.text);
  requestAnimationFrame(()=>{el.focus();el.setSelectionRange(r.start,r.end);});
 }
 const wrap=(a:string,b:string,ph:string)=>edit((t,s,e)=>{const mid=t.slice(s,e)||ph;return {text:t.slice(0,s)+a+mid+b+t.slice(e),start:s+a.length,end:s+a.length+mid.length};});
 const line=(prefix:string,ph:string)=>edit((t,s,e)=>{const ls=t.lastIndexOf('\n',s-1)+1,mid=t.slice(s,e)||ph,lead=ls===s?'':'\n';const ins=(s>ls?'\n\n':'')+prefix+mid+'\n\n';return {text:t.slice(0,s)+ins+t.slice(e),start:s+ins.length-mid.length-2,end:s+ins.length-2};void lead;});
 async function upload(file:File):Promise<string>{
  if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size===0||file.size>5242880)throw Error('Choose a PNG, JPG, WebP or GIF up to 5 MB.');
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':file.type==='image/gif'?'gif':'jpg',path=workspace.id+'/'+crypto.randomUUID()+'.'+ext;
  const db=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  const r=await db.storage.from('blog-images').upload(path,file,{contentType:file.type,upsert:false});
  if(r.error)throw Error('Image upload failed. Please retry.');return path;
 }
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}

 function payload(p:Post){
  const {id,client_id,title,slug,h1,excerpt,body,focus_keyword,hero_path,hero_alt,og_image_path,meta_title,meta_description,canonical_url,category,tags,author_name,publish_at}=p;
  return {action:'save',...(id?{id}:{}),client_id,title,slug,h1,excerpt,body,focus_keyword,hero_path,hero_alt,og_image_path,meta_title,meta_description,canonical_url,category,tags,author_name,publish_at};
 }
 const save=()=>run(async()=>{if(!sel)return;const row=await post(payload(sel));setSel(row);setSaved(JSON.stringify(row));setSlugTouched(true);setNotice('Saved.');await load();});
 const setStatus=(status:Post['status'],okMsg:string)=>run(async()=>{
  if(!sel)return;let cur=sel;
  if(dirty||!sel.id){cur=await post(payload(sel));}
  const row=await post({action:'status',id:cur.id,status});setSel(row);setSaved(JSON.stringify(row));setNotice(okMsg);await load();
 });

 const metaTitle=(sel?.meta_title||sel?.title||''),desc=sel?.meta_description??'';
 const snip=snippet(metaTitle,desc),live=sel?.canonical_url||(site&&sel?origin+'/blog/'+site+'/'+(sel.slug||'your-post'):'');
 const blockers=sel?publishBlockers(sel):[];
 const feedUrl=origin+'/api/public/blog?site='+site;

 if(error&&!posts.length&&!sel)return <p className="notice error" role="alert">{error}</p>;

 return <section className="people-area blog-editor">
  {!sel&&<>
   <div className="panel client-tickets-intro"><p>Write blog posts here, set the search details, and publish. Your website can show them from a public feed, and each post also has its own page.</p><div className="action-row"><button className="secondary" onClick={()=>setShowFeed(v=>!v)}>{showFeed?'Hide':'Show'} website connection</button><button className="primary" disabled={demo||busy} onClick={fresh}>+ New post</button></div></div>
   {showFeed&&<section className="panel blog-feed">
    <h3>Show these posts on your website</h3>
    <p>Only published posts appear. Draft, review and archived posts are never public.</p>
    {[['All posts (list)',feedUrl],['One post','/api/public/blog/<slug>?site='+site],['Ready-made blog page',origin+'/blog/'+site]].map(([l,u])=><div key={l} className="blog-feed-row"><strong>{l}</strong><code>{u.startsWith('/')?origin+u:u}</code><button type="button" className="secondary" onClick={()=>navigator.clipboard?.writeText(u.startsWith('/')?origin+u:u)} aria-label={'Copy '+l}><Copy size={14}/></button></div>)}
    <small>Developers: each post returns ready HTML, the heading outline, meta tags, social tags and structured data (JSON-LD). Your site can also just link to the ready-made pages.</small>
   </section>}
   {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
   <div className="action-row"><label>Search<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Title or address"/></label><label>Show<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All posts</option><option value="draft">Drafts</option><option value="review">In review</option><option value="published">Published</option><option value="archived">Archived</option></select></label></div>
   <div className="table-wrap"><table><thead><tr><th>Post</th><th>Status</th><th>SEO</th><th>Words</th><th>Updated</th></tr></thead><tbody>{rows.map(p=>{const s=seoScore(analyzePost(p));return <tr key={p.id}><td><button className="table-title" onClick={()=>open(p)}>{p.title||'(Untitled)'}<small>/{p.slug}{p.client_id?' · '+(clients.find(c=>c.id===p.client_id)?.title??'Client'):''}</small></button></td><td><span className="badge">{statusLabel[p.status]}</span></td><td><span className={'sla-pill '+pill(s)}>{s}%</span></td><td>{wordCount(p.body)}</td><td>{p.updated_at?new Date(p.updated_at).toLocaleDateString('en-GB'):'-'}</td></tr>;})}{!rows.length&&<tr><td colSpan={5}>No posts here yet. Use "New post" to write your first one.</td></tr>}</tbody></table></div>
  </>}

  {sel&&<form className="blog-form" onSubmit={e=>{e.preventDefault();void save();}}>
   <div className="panel-head"><div><span className="eyebrow">BLOG POST</span><h2>{sel.title||'New post'}</h2><p><span className="badge">{statusLabel[sel.status]}</span>{dirty&&<> · Unsaved changes</>}</p></div><button type="button" onClick={back}>Back to posts</button></div>
   {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
   {demo&&<p className="notice">Sample only. Sign in to write real posts.</p>}
   <div className="blog-layout">
    <div className="blog-main">
     <fieldset disabled={busy||demo} className="panel">
      <label>Title<input required maxLength={160} value={sel.title} onChange={e=>setTitle(e.target.value)} placeholder="The headline readers see"/></label>
      <label>URL slug<input required value={sel.slug} onChange={e=>{setSlugTouched(true);up('slug',slugify(e.target.value,90));}} placeholder="why-your-business-needs-a-website"/><small>{live?'Address: '+live:'The address of this post'}{sel.status==='published'?'. This post is live. Changing the slug breaks links people already have.':''}</small></label>
      <label>H1 heading (optional)<input maxLength={160} value={sel.h1} onChange={e=>up('h1',e.target.value)} placeholder={sel.title||'Leave empty to use the title'}/><small>The main heading on the page. One per page. Defaults to the title.</small></label>
      <label>Short summary<textarea rows={2} maxLength={400} value={sel.excerpt} onChange={e=>up('excerpt',e.target.value)} placeholder="One or two sentences for blog lists"/></label>
      <div className="form-grid">
       <label>Category<input maxLength={60} value={sel.category} onChange={e=>up('category',e.target.value)} placeholder="e.g. Websites"/></label>
       <label>Tags (comma separated)<input value={sel.tags.join(', ')} onChange={e=>up('tags',e.target.value.split(',').map(t=>t.trim()).filter(Boolean).slice(0,15))} placeholder="seo, hosting"/></label>
       <label>Author<input maxLength={100} value={sel.author_name} onChange={e=>up('author_name',e.target.value)} placeholder="Name shown on the post"/></label>
       <label>Blog for<select value={sel.client_id??''} onChange={e=>up('client_id',e.target.value||null)} disabled={Boolean(sel.id)}><option value="">NXT Workforce (our site)</option>{clients.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
      </div>
     </fieldset>

     <fieldset disabled={busy||demo} className="panel">
      <div className="build-section-head"><div><span className="eyebrow">CONTENT</span><h3>Write the post</h3></div><div className="blog-tabs"><button type="button" className={tab==='write'?'primary':'secondary'} onClick={()=>setTab('write')}>Write</button><button type="button" className={tab==='preview'?'primary':'secondary'} onClick={()=>setTab('preview')}>Preview</button></div></div>
      {tab==='write'?<>
       <div className="blog-toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" title="Heading 2 (section)" onClick={()=>line('## ','Section heading')}><Heading2 size={16}/></button>
        <button type="button" title="Heading 3 (sub-section)" onClick={()=>line('### ','Sub-heading')}><Heading3 size={16}/></button>
        <button type="button" title="Bold" onClick={()=>wrap('**','**','bold text')}><Bold size={16}/></button>
        <button type="button" title="Italic" onClick={()=>wrap('*','*','italic text')}><Italic size={16}/></button>
        <button type="button" title="Bulleted list" onClick={()=>line('- ','List item')}><List size={16}/></button>
        <button type="button" title="Numbered list" onClick={()=>line('1. ','List item')}><ListOrdered size={16}/></button>
        <button type="button" title="Quote" onClick={()=>line('> ','Quote')}><Quote size={16}/></button>
        <button type="button" title="Link" onClick={()=>wrap('[','](https://)','link text')}><Link2 size={16}/></button>
        <label className="blog-image-btn" title="Insert a picture"><ImagePlus size={16}/><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void run(async()=>{const path=await upload(f);edit((t,s,en)=>{const ins=(s>0&&t[s-1]!=='\n'?'\n\n':'')+'!['+'Describe this image]('+img(path)+')\n\n';return {text:t.slice(0,s)+ins+t.slice(en),start:s+ins.indexOf('Describe'),end:s+ins.indexOf('Describe')+'Describe this image'.length};});});}}/></label>
       </div>
       <textarea ref={area} className="blog-body-input" rows={22} value={sel.body} onChange={e=>up('body',e.target.value)} placeholder={'Start with a short intro, then use ## for sections and ### inside them.\n\n## First section\n\nYour text...'}/>
       <small>{words} words. Use ## for H2 sections and ### for H3. Do not use a single # (the H1 is set above). After adding a picture, replace "Describe this image" with a short description. That is the alt text.</small>
      </>:<div className="blog-preview"><h1>{sel.h1||sel.title}</h1>{sel.hero_path&&<img src={img(sel.hero_path)} alt={sel.hero_alt}/>}<div dangerouslySetInnerHTML={{__html:html}}/>{!sel.body.trim()&&<p className="empty compact">Nothing to preview yet.</p>}</div>}
     </fieldset>

     <fieldset disabled={busy||demo} className="panel">
      <span className="eyebrow">IMAGES</span><h3>Main image</h3>
      <div className="blog-hero-row">{sel.hero_path?<img className="blog-hero-thumb" src={img(sel.hero_path)} alt={sel.hero_alt||'Main image'}/>:<div className="blog-hero-thumb empty">No image</div>}
       <div><label className="secondary logo-upload-button">{sel.hero_path?'Replace image':'Upload main image'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void run(async()=>{up('hero_path',await upload(f));});}}/></label>
        {sel.hero_path&&<button type="button" className="secondary" onClick={()=>{up('hero_path',null);up('hero_alt','');}}>Remove from post</button>}
        <small>PNG, JPG, WebP or GIF up to 5 MB. Wide pictures (about 1200 by 630) share best.</small></div></div>
      <label>Alt text (describe the picture)<input maxLength={200} value={sel.hero_alt} onChange={e=>up('hero_alt',e.target.value)} placeholder="e.g. A shop owner updating her website on a laptop"/><small>Read aloud by screen readers and used by Google Images.</small></label>
     </fieldset>

     <fieldset disabled={busy||demo} className="panel">
      <span className="eyebrow">SEARCH APPEARANCE</span><h3>Meta tags</h3>
      <label>Focus keyword<input maxLength={80} value={sel.focus_keyword} onChange={e=>up('focus_keyword',e.target.value)} placeholder="The phrase people would search for"/></label>
      <label>Meta title <span className={'blog-count '+(metaTitle.length>60?'over':'')}>{metaTitle.length}/60</span><input maxLength={120} value={sel.meta_title} onChange={e=>up('meta_title',e.target.value)} placeholder={sel.title||'Defaults to the title'}/></label>
      <label>Meta description <span className={'blog-count '+(desc.length>160?'over':'')}>{desc.length}/160</span><textarea rows={3} maxLength={320} value={sel.meta_description} onChange={e=>up('meta_description',e.target.value)} placeholder="The text shown under your title in Google"/></label>
      <label>Canonical address (optional)<input value={sel.canonical_url} onChange={e=>up('canonical_url',e.target.value.trim())} placeholder="https://www.nxt-workforce.com/blog/your-post"/><small>Set this to the page address on your own website so Google counts that page as the original.</small></label>
      <div className="blog-serp" aria-label="Google preview"><span className="blog-serp-url">{(live||'https://yoursite.com/blog/post').replace(/^https?:\/\//,'')}</span><strong>{snip.title||'Your meta title'}</strong><p>{snip.description||'Your meta description appears here.'}</p></div>
      <div className="blog-share" aria-label="Social card preview">{(sel.og_image_path||sel.hero_path)?<img src={img(sel.og_image_path||sel.hero_path)} alt=""/>:<div className="blog-share-empty">No share image</div>}<div><small>{(live||'yoursite.com').replace(/^https?:\/\//,'').split('/')[0]}</small><strong>{metaTitle||'Title'}</strong><p>{desc||sel.excerpt}</p></div></div>
      <div className="action-row"><label className="secondary logo-upload-button">{sel.og_image_path?'Replace share image':'Upload a separate share image'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void run(async()=>{up('og_image_path',await upload(f));});}}/></label>{sel.og_image_path&&<button type="button" className="secondary" onClick={()=>up('og_image_path',null)}>Use main image</button>}</div>
     </fieldset>
    </div>

    <aside className="blog-side">
     <section className="panel blog-publish">
      <span className="eyebrow">PUBLISH</span>
      <label>Publish date (optional)<input type="datetime-local" value={toLocalInput(sel.publish_at)} onChange={e=>up('publish_at',e.target.value?new Date(e.target.value).toISOString():null)} disabled={busy||demo||(sel.status==='published'&&!canPublish)}/><small>Leave empty to go live straight away. A later date keeps it hidden until then.</small></label>
      <div className="blog-actions">
       <button className="primary" disabled={busy||demo||!sel.title.trim()||!sel.slug}>Save</button>
       {(sel.status==='draft'||sel.status==='archived')&&<button type="button" className="secondary" disabled={busy||demo||!sel.title.trim()||!sel.slug||sel.status==='archived'} onClick={()=>setStatus('review','Sent for review.')}>Send for review</button>}
       {sel.status!=='published'&&sel.status!=='archived'&&<button type="button" className="primary" disabled={busy||demo||!canPublish||blockers.length>0||!sel.title.trim()} onClick={()=>setStatus('published','Published.')}>Publish</button>}
       {sel.status==='published'&&<button type="button" className="secondary" disabled={busy||demo||!canPublish} onClick={()=>{if(window.confirm('Take this post offline? It goes back to draft.'))void setStatus('draft','Unpublished. The post is a draft again.');}}>Unpublish</button>}
       {sel.id&&sel.status!=='archived'&&<button type="button" className="secondary" disabled={busy||demo||(sel.status==='published'&&!canPublish)} onClick={()=>{if(window.confirm('Archive this post? It is hidden from the public and can be restored. Nothing is deleted.'))void setStatus('archived','Archived.');}}><Archive size={14}/>Archive</button>}
       {sel.status==='archived'&&<button type="button" className="secondary" disabled={busy||demo} onClick={()=>setStatus('draft','Restored as a draft.')}><RotateCcw size={14}/>Restore</button>}
      </div>
      {!canPublish&&sel.status!=='published'&&<small>Publishing needs approval permission. Send the post for review and an approver will publish it.</small>}
      {canPublish&&sel.status!=='published'&&blockers.length>0&&<ul className="blog-blockers">{blockers.map(b=><li key={b}>{b}</li>)}</ul>}
      {sel.status==='published'&&site&&sel.id&&!sel.client_id&&<a className="secondary" href={'/blog/'+site+'/'+sel.slug} target="_blank" rel="noreferrer">View live page</a>}
     </section>

     <section className="panel blog-seo">
      <div className="build-section-head"><div><span className="eyebrow">SEO CHECKLIST</span><h3>Search score</h3></div><span className={'sla-pill '+pill(score)}>{score}%</span></div>
      <div className="build-checks">{checks.map(c=><article key={c.key} className={'site-check '+c.state}><strong>{c.state==='pass'?'Pass':c.state==='warn'?'Review':'Fix'} · {c.label}</strong><small>{c.detail}</small></article>)}</div>
     </section>

     <section className="panel blog-outline">
      <span className="eyebrow">STRUCTURE</span><h3>Heading outline</h3>
      <ul><li className="h1"><b>H1</b> {sel.h1||sel.title||'(no title yet)'}</li>{heads.map((h,i)=><li key={i} className={'h'+h.level}><b>H{h.level}</b> {h.text}</li>)}</ul>
      {!heads.length&&<small>No sections yet. Add H2 headings to break up the post.</small>}
     </section>
    </aside>
   </div>
  </form>}
 </section>;
}
