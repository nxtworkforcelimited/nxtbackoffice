'use client';
import {useMemo,useState} from 'react';
import styles from './website-manager.module.css';
type PageRow={id:string;slug:string;title:string;description:string;status:'draft'|'published';content:{eyebrow?:string;heading?:string;body?:string;cta_label?:string;cta_href?:string}};
export default function WebsiteManager({initial,workspace}:{initial:PageRow[];workspace:string}){
 const [pages,setPages]=useState(initial),[active,setActive]=useState(initial[0]?.slug??''),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const page=useMemo(()=>pages.find(p=>p.slug===active),[pages,active]);
 function change<K extends keyof PageRow>(key:K,value:PageRow[K]){setPages(rows=>rows.map(p=>p.slug===active?{...p,[key]:value}:p));}
 function content(key:string,value:string){setPages(rows=>rows.map(p=>p.slug===active?{...p,content:{...p.content,[key]:value}}:p));}
 async function save(status?:'draft'|'published'){
  if(!page)return;setSaving(true);setMessage('');
  const payload={...page,status:status??page.status};
  const r=await fetch('/api/website/pages?workspace='+workspace,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const b=await r.json().catch(()=>({}));setSaving(false);
  if(!r.ok){setMessage(b.error??'Could not save page');return;}
  setPages(rows=>rows.map(p=>p.id===b.id?b:p));setMessage(status==='published'?'Published successfully.':'Saved.');
 }
 if(!page)return <main className={styles.empty}><h1>No website pages found</h1><p>Apply the website CMS database migration first.</p></main>;
 return <div className={styles.shell}>
  <aside><div className={styles.brand}>NXT <span>Website Manager</span></div><a className={styles.back} href="/app">← Business OS</a><nav>{pages.map(p=><button key={p.slug} className={p.slug===active?styles.active:''} onClick={()=>{setActive(p.slug);setMessage('')}}><span>{p.title}</span><small>/{p.slug==='home'?'':p.slug}</small></button>)}</nav></aside>
  <main><header><div><span className={styles.eyebrow}>WEBSITE</span><h1>{page.title}</h1><p>/{page.slug==='home'?'':page.slug}</p></div><div className={styles.actions}><a href={page.slug==='home'?'/':'/'+page.slug} target="_blank" rel="noreferrer">Preview</a><button disabled={saving} onClick={()=>save('draft')}>Save Draft</button><button className={styles.publish} disabled={saving} onClick={()=>save('published')}>Publish</button></div></header>
  <section className={styles.panel}><h2>Page settings</h2><div className={styles.grid}><label>SEO / browser title<input value={page.title} onChange={e=>change('title',e.target.value)}/></label><label>Status<select value={page.status} onChange={e=>change('status',e.target.value as PageRow['status'])}><option value="draft">Draft</option><option value="published">Published</option></select></label></div><label>Meta description<textarea rows={3} value={page.description} onChange={e=>change('description',e.target.value)}/></label></section>
  <section className={styles.panel}><h2>Hero section</h2><div className={styles.grid}><label>Eyebrow<input value={page.content.eyebrow??''} onChange={e=>content('eyebrow',e.target.value)}/></label><label>CTA label<input value={page.content.cta_label??''} onChange={e=>content('cta_label',e.target.value)}/></label></div><label>Heading<textarea rows={2} value={page.content.heading??''} onChange={e=>content('heading',e.target.value)}/></label><label>Intro copy<textarea rows={6} value={page.content.body??''} onChange={e=>content('body',e.target.value)}/></label><label>CTA link<input value={page.content.cta_href??''} onChange={e=>content('cta_href',e.target.value)}/></label></section>
  <section className={styles.panel}><h2>Next editor modules</h2><div className={styles.moduleGrid}>{['Images & Media','Sections','Navigation','Footer','SEO','Blog & Insights','Forms','Redirects'].map(x=><div key={x}><strong>{x}</strong><span>Prepared for phase 2</span></div>)}</div></section>
  {message&&<p className={styles.message}>{message}</p>}
  </main>
 </div>
}
