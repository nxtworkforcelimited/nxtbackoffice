'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {CalendarDays,Link2,RefreshCw,Send,Users,AlertCircle,CheckCircle2,Clock3} from 'lucide-react';
import type {Workspace,RecordRow} from '@/lib/types';
type Client={id:string;title:string};
type Account={id:string;client_id:string|null;provider:string;account_name:string;external_account_id:string;status:string;token_expires_at:string|null};
type Campaign={id:string;client_id:string|null;title:string;status:string};
type Job={id:string;post_id:string;account_id:string;provider:string;scheduled_at:string;status:string;attempts:number;last_error:string|null;published_at:string|null};
export default function SocialPublisher({workspace,clients,posts}:{workspace:Workspace;clients:RecordRow[];posts:RecordRow[]}){
 const [data,setData]=useState<{campaigns:Campaign[];accounts:Account[];jobs:Job[];posts:any[];providers:any[]}>({campaigns:[],accounts:[],jobs:[],posts:[],providers:[]}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [campaignTitle,setCampaignTitle]=useState(''),[campaignClient,setCampaignClient]=useState(''),[postId,setPostId]=useState(''),[accountId,setAccountId]=useState(''),[scheduled,setScheduled]=useState(()=>{const d=new Date(Date.now()+3600000);d.setMinutes(Math.ceil(d.getMinutes()/15)*15,0,0);return d.toISOString().slice(0,16);}),[copy,setCopy]=useState('');
 const base='/api/social/scheduler?workspace='+workspace.id;
 const load=useCallback(async()=>{const r=await fetch(base,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setData(b);},[base]);
 useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
 async function action(payload:any){setBusy(true);setError('');setNotice('');try{const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),b=await r.json();if(!r.ok)throw Error(b.error);setNotice('Saved.');await load();return b;}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const approved=data.posts.filter(p=>p.status==='approved'),activeAccounts=data.accounts.filter(a=>a.status==='active'),scheduledJobs=data.jobs.filter(j=>['scheduled','publishing'].includes(j.status)),failed=data.jobs.filter(j=>j.status==='failed'),published=data.jobs.filter(j=>j.status==='published');
 const accountName=(id:string)=>data.accounts.find(a=>a.id===id)?.account_name||'Account';
 const postName=(id:string)=>data.posts.find(p=>p.id===id)?.title||'Post';
 const clientName=(id:string|null)=>clients.find(c=>c.id===id)?.title||(id?'Client':'NXT Workforce');
 const selectedPost=data.posts.find(p=>p.id===postId);
 useEffect(()=>{if(selectedPost)setCopy(selectedPost.description||selectedPost.title||'');},[postId]);
 return <section className="social-publisher">
  <div className="social-publisher-head"><div><span className="eyebrow">NXT SOCIAL PUBLISHER</span><h2>Schedule, publish and track social content</h2><p>Approved content moves from your calendar into a publishing queue. Provider credentials stay server-side.</p></div><button className="secondary" disabled={busy} onClick={()=>load().catch(e=>setError(e.message))}><RefreshCw size={15}/>Refresh</button></div>
  <div className="social-publish-metrics"><div><Clock3/><span>Scheduled<strong>{scheduledJobs.length}</strong></span></div><div><CheckCircle2/><span>Published<strong>{published.length}</strong></span></div><div><AlertCircle/><span>Failed<strong>{failed.length}</strong></span></div><div><Users/><span>Connected accounts<strong>{activeAccounts.length}</strong></span></div></div>
  {error&&<p className="notice error">{error}</p>}{notice&&<p className="notice">{notice}</p>}
  <div className="social-publisher-grid">
   <section className="panel social-connect"><div className="panel-head"><div><h3>Connected accounts</h3><p>Facebook, Instagram, LinkedIn and TikTok are isolated per client.</p></div></div>
    <div className="social-provider-grid">{data.providers.map(p=>{const linked=data.accounts.filter(a=>a.provider===p.provider);return <article key={p.provider} className={'social-provider '+(linked.some(a=>a.status==='active')?'connected':'')}><strong>{p.label}</strong><span>{linked.length?linked.map(a=>a.account_name).join(', '):p.configured?'OAuth app configured · no account connected':'Developer app credentials required'}</span><em>{linked.some(a=>a.status==='active')?'Connected':p.configured?'Ready to connect':'Setup required'}</em></article>})}</div>
   </section>
   <section className="panel social-campaigns"><div className="panel-head"><div><h3>Campaigns</h3><p>Group posts for a client campaign.</p></div></div>
    <form onSubmit={e=>{e.preventDefault();if(!campaignTitle.trim())return;action({action:'campaign_create',title:campaignTitle,client_id:campaignClient||null}).then(()=>setCampaignTitle(''));}}>
     <label>Campaign name<input value={campaignTitle} onChange={e=>setCampaignTitle(e.target.value)} placeholder="e.g. JBC Engineering Dignity" maxLength={160}/></label>
     <label>Client<select value={campaignClient} onChange={e=>setCampaignClient(e.target.value)}><option value="">NXT / internal</option>{clients.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
     <button className="secondary" disabled={busy||!campaignTitle.trim()}>Create campaign</button>
    </form>
    <div className="social-campaign-list">{data.campaigns.slice(0,6).map(c=><span key={c.id}><b>{c.title}</b><small>{clientName(c.client_id)}</small></span>)}{!data.campaigns.length&&<p className="footnote">No campaigns yet.</p>}</div>
   </section>
  </div>
  <section className="panel social-schedule-card"><div className="panel-head"><div><h3>Schedule approved content</h3><p>Only fully approved posts can enter the publishing queue.</p></div><span className="badge">{approved.length} approved</span></div>
   <div className="social-schedule-form">
    <label>Approved post<select value={postId} onChange={e=>setPostId(e.target.value)}><option value="">Choose post</option>{approved.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
    <label>Social account<select value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Choose account</option>{activeAccounts.map(a=><option key={a.id} value={a.id}>{a.account_name} · {a.provider}</option>)}</select></label>
    <label>Publish date & time<input type="datetime-local" value={scheduled} onChange={e=>setScheduled(e.target.value)}/></label>
    <label className="social-copy">Platform copy<textarea rows={4} value={copy} onChange={e=>setCopy(e.target.value)} maxLength={5000}/></label>
    <button className="primary" disabled={busy||!postId||!accountId||!scheduled} onClick={()=>{const dt=new Date(scheduled);if(Number.isNaN(dt.valueOf()))return;action({action:'schedule',post_id:postId,account_ids:[accountId],scheduled_at:dt.toISOString(),copy}).then(()=>{setPostId('');setAccountId('');setCopy('');});}}><Send size={15}/>Schedule post</button>
   </div>
   {!activeAccounts.length&&<p className="social-blocker"><Link2 size={16}/>The scheduler is live, but no external social account is connected yet. Add provider developer credentials and OAuth account connection before scheduling.</p>}
  </section>
  <section className="panel social-queue"><div className="panel-head"><div><h3>Publishing queue</h3><p>Every attempt is logged; failed posts can be retried safely.</p></div></div>
   <div className="table-wrap"><table><thead><tr><th>Post</th><th>Account</th><th>Provider</th><th>Scheduled</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.jobs.slice(0,30).map(j=><tr key={j.id}><td>{postName(j.post_id)}{j.last_error&&<small>{j.last_error}</small>}</td><td>{accountName(j.account_id)}</td><td>{j.provider}</td><td>{new Date(j.scheduled_at).toLocaleString()}</td><td><span className={'badge '+j.status}>{j.status}</span></td><td>{j.status==='failed'?<button className="text-button" disabled={busy} onClick={()=>action({action:'retry',job_id:j.id})}>Retry</button>:j.status==='scheduled'?<button className="text-button" disabled={busy} onClick={()=>action({action:'cancel',job_id:j.id})}>Cancel</button>:'—'}</td></tr>)}</tbody></table>{!data.jobs.length&&<div className="empty compact">Nothing scheduled yet.</div>}</div>
  </section>
 </section>;
}
