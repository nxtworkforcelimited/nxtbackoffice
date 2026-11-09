'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Plus,RefreshCw} from 'lucide-react';
const statusLabel:Record<string,string>={planned:'Planned',active:'Active',paused:'Paused',completed:'Completed'};
const channels=['LinkedIn','Facebook','Instagram','WhatsApp','Email','SMS','Cold calling','Google Ads','Events and print','Website','Other'];
const fmtDate=(d:string|null)=>d?new Date(d+'T00:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'';
const dates=(c:any)=>c.start_date&&c.end_date?fmtDate(c.start_date)+' to '+fmtDate(c.end_date):c.start_date?'From '+fmtDate(c.start_date):c.end_date?'Until '+fmtDate(c.end_date):'No dates set';
const sampleCampaigns=[
 {id:'s1',client_id:'c1',name:'Festive offer',channel:'LinkedIn',status:'active',start_date:'2026-11-01',end_date:'2026-12-24',objective:'Fill December bookings with new business enquiries.',client_summary:'Posts and tracked links went live on 1 November.',target_leads:40,budget:600,currency:'USD',client_visible:true,results:{linked:true,links:3,clicks:182,unique:131},calling:{prospects:60,calls:44,interested:7,converted:2}},
 {id:'s2',client_id:'c1',name:'Cold call: new suppliers',channel:'Cold calling',status:'planned',start_date:'2026-11-16',end_date:'',objective:'Call 100 suppliers and book intro meetings.',client_summary:'',target_leads:null,budget:0,currency:'USD',client_visible:false,results:{linked:false,links:0,clicks:0,unique:0},calling:null},
 {id:'s3',client_id:'c2',name:'Spring newsletter',channel:'Email',status:'completed',start_date:'2026-09-01',end_date:'2026-09-30',objective:'Re-engage past customers.',client_summary:'Completed with a strong open rate.',target_leads:20,budget:150,currency:'USD',client_visible:true,results:{linked:true,links:1,clicks:96,unique:80},calling:null}];
const sampleClients=[{id:'c1',title:'Sample Client One'},{id:'c2',title:'Sample Client Two'}];
export default function Campaigns({workspace,client,demo=false}:{workspace:string;client:boolean;demo?:boolean}){
 const [data,setData]=useState<any>(demo?{campaigns:client?sampleCampaigns.filter(c=>c.client_visible&&c.client_id==='c1'):sampleCampaigns,clients:sampleClients}:{campaigns:[],clients:[]}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(!demo);
 const [form,setForm]=useState<any>(null),[clientFilter,setClientFilter]=useState('all'),[statusFilter,setStatusFilter]=useState('all'),[showArchived,setShowArchived]=useState(false);
 const load=useCallback(async()=>{if(demo){setLoading(false);return;}const r=await fetch('/api/campaigns?workspace='+workspace+(showArchived?'&archived=1':''),{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error||'Campaigns could not load');setData(b);setLoading(false);},[workspace,showArchived,demo]);
 useEffect(()=>{load().catch(e=>{setError(e.message);setLoading(false);});},[load]);
 async function send(v:any,done:string){setBusy(true);setError('');setNotice('');try{const r=await fetch('/api/campaigns?workspace='+workspace,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)}),b=await r.json();if(!r.ok)throw Error(b.error);setNotice(done);setForm(null);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const clientName=(id:string)=>data.clients?.find((c:any)=>c.id===id)?.title||'Client';
 const list=useMemo(()=>(data.campaigns||[]).filter((c:any)=>(clientFilter==='all'||c.client_id===clientFilter)&&(statusFilter==='all'||c.status===statusFilter)),[data.campaigns,clientFilter,statusFilter]);
 const groups=useMemo(()=>{const m=new Map<string,any[]>();for(const c of list){const k=client?'mine':c.client_id;m.set(k,[...(m.get(k)||[]),c]);}return [...m.entries()].sort((a,b)=>clientName(a[0]).localeCompare(clientName(b[0])));},[list,data.clients,client]);
 const counts=useMemo(()=>({active:(data.campaigns||[]).filter((c:any)=>c.status==='active'&&!c.archived_at).length,planned:(data.campaigns||[]).filter((c:any)=>c.status==='planned'&&!c.archived_at).length,clicks:(data.campaigns||[]).reduce((n:number,c:any)=>n+(c.results?.clicks||0),0)}),[data.campaigns]);
 function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(demo){setNotice('This is the sample workspace, so nothing was saved.');setForm(null);return;}const f=new FormData(e.currentTarget),g=(k:string)=>String(f.get(k)??'');
  const body:any={name:g('name'),objective:g('objective'),channel:g('channel'),status:g('status'),start_date:g('start_date'),end_date:g('end_date'),budget:g('budget')||0,currency:g('currency')||'USD',target_leads:g('target_leads'),utm_campaign:g('utm_campaign'),call_campaign:g('call_campaign'),client_summary:g('client_summary'),internal_notes:g('internal_notes'),client_visible:f.get('client_visible')==='on'};
  if(form.id)send({action:'update',id:form.id,...body},'Campaign updated.');else send({action:'create',client_id:g('client_id'),...body},'Campaign added.');}
 return <section className="nxt-campaigns">
  {demo&&<p className="notice">Sample campaigns shown. Nothing here is saved in the sample workspace.</p>}
  {!client&&<div className="nxt-camp-top"><div className="nxt-camp-stats"><div><span>Active</span><strong>{counts.active}</strong></div><div><span>Planned</span><strong>{counts.planned}</strong></div><div><span>Clicks, last 90 days</span><strong>{counts.clicks}</strong></div></div><div className="action-row"><button className="secondary" onClick={()=>load().catch(e=>setError(e.message))}><RefreshCw size={15}/>Refresh</button><button className="primary" onClick={()=>setForm({})}><Plus size={15}/>Add campaign</button></div></div>}
  {error&&<p className="notice error">{error}</p>}{notice&&<p className="notice">{notice}</p>}
  {!client&&<div className="panel nxt-camp-filters"><label>Client<select value={clientFilter} onChange={e=>setClientFilter(e.target.value)}><option value="all">All clients</option>{data.clients?.map((c:any)=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><label>Status<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="nxt-check"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/>Show archived</label></div>}
  {loading&&<p className="empty compact">Loading campaigns…</p>}
  {!loading&&!groups.length&&<div className="panel empty">{client?'Your campaigns will appear here once the NXT team shares them with you.':'No campaigns yet. Use Add campaign to start one for a client.'}</div>}
  {groups.map(([key,items])=><section key={key} className="nxt-camp-group">{!client&&<h3>{clientName(key)}</h3>}<div className="nxt-camp-grid">{items.map((c:any)=><article key={c.id} className={'panel nxt-camp-card'+(c.archived_at?' archived':'')}>
   <header><div><h4>{c.name}</h4><small>{[c.channel,dates(c)].filter(Boolean).join(' · ')}</small></div><span className={'badge camp-'+c.status}>{c.archived_at?'Archived':statusLabel[c.status]}</span></header>
   {(client?c.client_summary||c.objective:c.objective)&&<p>{client?c.client_summary||c.objective:c.objective}</p>}
   <dl className="nxt-camp-results">
    <div><dt>Clicks</dt><dd>{c.results?.linked?c.results.clicks:'None'}</dd></div>
    <div><dt>Unique visitors</dt><dd>{c.results?.linked?c.results.unique:'None'}</dd></div>
    {!client&&<div><dt>Calls made</dt><dd>{c.calling?c.calling.calls:'None'}</dd></div>}
    {!client&&<div><dt>Interested</dt><dd>{c.calling?c.calling.interested:'None'}</dd></div>}
    {!client&&<div><dt>Converted</dt><dd>{c.calling?c.calling.converted:'None'}</dd></div>}
    {c.target_leads!=null&&<div><dt>Lead target</dt><dd>{c.target_leads}</dd></div>}
   </dl>
   {!client&&<footer><span className={'badge '+(c.client_visible?'camp-active':'camp-planned')}>{c.client_visible?'Visible to client':'Internal only'}</span>{Number(c.budget)>0&&<small>Budget {c.currency} {Number(c.budget).toLocaleString()}</small>}<span className="nxt-spacer"/><button className="secondary" onClick={()=>setForm(c)}>Edit</button><button className="secondary" disabled={busy} onClick={()=>send({action:'archive',id:c.id,archived:!c.archived_at},c.archived_at?'Campaign restored.':'Campaign archived. Nothing was deleted.')}>{c.archived_at?'Restore':'Archive'}</button></footer>}
   {client&&!c.results?.linked&&<small className="nxt-hint">Click results appear here once tracked links are shared for this campaign.</small>}
  </article>)}</div></section>)}
  {form&&!client&&<div className="calling-modal-backdrop"><form key={form.id||'new'} className="panel calling-modal" onSubmit={submit}>
   <div className="panel-head"><h3>{form.id?'Edit campaign':'Add campaign'}</h3><button type="button" onClick={()=>setForm(null)}>Close</button></div>
   <div className="form-grid">
    <label>Client<select name="client_id" required disabled={!!form.id} defaultValue={form.client_id||''}><option value="" disabled>Choose a client</option>{data.clients?.map((c:any)=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
    <label>Campaign name<input name="name" required maxLength={160} defaultValue={form.name||''} placeholder="e.g. Festive offer"/></label>
    <label>Channel<input name="channel" list="camp-channels" defaultValue={form.channel||''} placeholder="Choose or type"/><datalist id="camp-channels">{channels.map(x=><option key={x} value={x}/>)}</datalist></label>
    <label>Status<select name="status" defaultValue={form.status||'planned'}>{Object.entries(statusLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label>Start date<input name="start_date" type="date" defaultValue={form.start_date||''}/></label>
    <label>End date<input name="end_date" type="date" defaultValue={form.end_date||''}/></label>
    <label>Budget<input name="budget" type="number" min="0" step="0.01" defaultValue={form.budget??0}/></label>
    <label>Currency<input name="currency" maxLength={3} defaultValue={form.currency||'USD'}/></label>
    <label>Lead target<input name="target_leads" type="number" min="0" defaultValue={form.target_leads??''}/></label>
    <label>Tracked link name<input name="utm_campaign" maxLength={160} defaultValue={form.utm_campaign||''} placeholder="Same as the campaign name in UTM and QR"/></label>
    <label>Cold calling campaign<input name="call_campaign" maxLength={160} defaultValue={form.call_campaign||''} placeholder="Exact name used on the calling list"/></label>
   </div>
   <label>Objective<textarea name="objective" rows={2} maxLength={2000} defaultValue={form.objective||''} placeholder="What is this campaign meant to achieve?"/></label>
   <label>Message for the client<textarea name="client_summary" rows={2} maxLength={2000} defaultValue={form.client_summary||''} placeholder="Shown to the client if you make this campaign visible"/></label>
   <label>Internal notes<textarea name="internal_notes" rows={2} maxLength={5000} defaultValue={form.internal_notes||''} placeholder="Staff only. Never shown to the client."/></label>
   <label className="nxt-check"><input type="checkbox" name="client_visible" defaultChecked={!!form.client_visible}/>Show this campaign to the client in their portal (budget and internal notes are never shown)</label>
   <button className="primary" disabled={busy}>{form.id?'Save changes':'Add campaign'}</button>
  </form></div>}
 </section>;
}
