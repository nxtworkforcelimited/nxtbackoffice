'use client';
import {useEffect,useState} from 'react';
import type {Workspace} from '@/lib/types';
import {allowed} from '@/lib/business';
import {ticketComplete,ticketLabel} from '@/lib/tickets';
import {CheckCircle2,Globe,LayoutDashboard,Users,CalendarDays,ClipboardCheck} from 'lucide-react';

type CheckItem={key:string;label:string;done:boolean};
type Build={
 id?:string;
 title:string;
 description:string;
 url:string;
 prototype_url:string;
 status:string;
 assignee_id:string|null;
 assignee_ids:string[];
 client_id:string|null;
 target_date:string|null;
 review_notes:string;
 build_types:('Website'|'Back Office')[];
 content_status:string;
 client_review_status:string;
 checklist:CheckItem[];
 hosting_managed:boolean;
 dns_managed:boolean;
 maintenance_plan:string|null;
};
type Client={id:string;title:string;status:string};
type Ticket={id:string;backoffice_id:string|null;title:string;reference:string;status:string;priority:string};
type Staff={user_id:string;name:string};

const stages=['Not started','In progress','Under review','Testing mode','Testing passed','Testing failed'];
const contentStages=['Not started','Awaiting client','Content received','In progress','Done'];
const clientReviewStages=['Not sent','Awaiting review','Approved','Needs revisions'];

const websiteChecks:CheckItem[]=[
 {key:'content',label:'Final content added and proofread',done:false},
 {key:'desktop',label:'Desktop layout tested',done:false},
 {key:'mobile',label:'Mobile and tablet layout tested',done:false},
 {key:'links',label:'Navigation and links tested',done:false},
 {key:'forms',label:'Forms, bookings and contact actions tested',done:false},
 {key:'contacts',label:'Contact details and social links checked',done:false},
 {key:'seo',label:'Page titles, meta descriptions and indexing basics checked',done:false},
 {key:'analytics',label:'Analytics / Tag Manager tracking checked',done:false},
 {key:'domain',label:'Domain, DNS, SSL and redirects checked',done:false},
 {key:'performance',label:'Images, loading speed and broken assets checked',done:false}
];
const backOfficeChecks:CheckItem[]=[
 {key:'login',label:'Login and password/reset flow tested',done:false},
 {key:'permissions',label:'User roles and permissions tested',done:false},
 {key:'workflows',label:'Main workflows and forms tested end to end',done:false},
 {key:'notifications',label:'Email / SMS / system notifications tested',done:false},
 {key:'data',label:'Client-specific data visibility tested',done:false},
 {key:'mobile_admin',label:'Responsive admin/mobile layout checked',done:false},
 {key:'backup',label:'Backup / recovery process confirmed',done:false},
 {key:'error_states',label:'Validation, empty states and error states tested',done:false}
];

function checklistFor(types:Build['build_types'],existing:CheckItem[]=[]){
 const desired=[...(types.includes('Website')?websiteChecks:[]),...(types.includes('Back Office')?backOfficeChecks:[])];
 const previous=new Map(existing.map(i=>[i.key,i]));
 return desired.map(item=>({...item,done:previous.get(item.key)?.done??false}));
}
const blank:Build={
 title:'',description:'',url:'',prototype_url:'',status:'Not started',assignee_id:null,assignee_ids:[],
 client_id:null,target_date:null,review_notes:'',build_types:['Website'],content_status:'Not started',
 client_review_status:'Not sent',checklist:checklistFor(['Website']),hosting_managed:false,dns_managed:false,maintenance_plan:null
};

export default function Builds({workspace,demo=false}:{workspace:Workspace;demo?:boolean}){
 const [builds,setBuilds]=useState<Build[]>([]),[tickets,setTickets]=useState<Ticket[]>([]),[staff,setStaff]=useState<Staff[]>([]),[clients,setClients]=useState<Client[]>([]),[selected,setSelected]=useState<Build|null>(null),[search,setSearch]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const base='/api/builds?workspace='+workspace.id,manage=allowed(workspace.role,workspace.permissions??[],'tickets');
 async function load(){
  const r=await fetch(base,{cache:'no-store'}),b=await r.json();
  if(!r.ok)throw Error(b.error);
  setBuilds((b.backoffice_builds??[]).map((x:any)=>({...x,build_types:x.build_types?.length?x.build_types:['Back Office'],content_status:x.content_status??'Not started',client_review_status:x.client_review_status??'Not sent',checklist:Array.isArray(x.checklist)?x.checklist:[]})));
  setTickets(b.it_tickets??[]);setStaff(b.staff_directory??[]);setClients(b.clients??[]);
 }
 useEffect(()=>{if(!demo)load().catch(e=>setError(e.message));},[base,demo]);
 const linked=(id?:string)=>tickets.filter(t=>t.backoffice_id===id),open=(id?:string)=>linked(id).filter(t=>!ticketComplete(t.status));
 const name=(id:string|null)=>staff.find(s=>s.user_id===id)?.name??'Unassigned';
 const assigneeNames=(b:Build)=>(b.assignee_ids??[]).length?(b.assignee_ids??[]).map(id=>name(id)).join(', '):'Unassigned';
 const clientName=(id:string|null)=>id?clients.find(c=>c.id===id)?.title??'Unknown client':'Internal / NXT Workforce';
 const qaProgress=(b:Build)=>{const list=b.checklist??[];return list.length?Math.round(list.filter(i=>i.done).length/list.length*100):0;};
 const ready=(b:Build)=>b.status==='Testing passed'&&b.client_review_status==='Approved'&&qaProgress(b)===100&&open(b.id).length===0;
 function update<K extends keyof Build>(key:K,value:Build[K]){setSelected(s=>s?{...s,[key]:value}:s);}
 function toggleType(type:'Website'|'Back Office'){
  setSelected(s=>{
   if(!s)return s;
   const has=s.build_types.includes(type);
   const next=has?s.build_types.filter(x=>x!==type):[...s.build_types,type];
   if(!next.length)return s;
   return {...s,build_types:next,checklist:checklistFor(next,s.checklist)};
  });
 }
 function setCheck(key:string,done:boolean){setSelected(s=>s?{...s,checklist:(s.checklist??[]).map(i=>i.key===key?{...i,done}:i)}:s);}

 return <section className="people-area builds-workspace">
  <section className="builds-hero">
   <div><span className="eyebrow">DELIVERY BUILDS</span><h2>Websites & Back Offices</h2><p>Track content, build progress, QA, client review and launch readiness in one place.</p></div>
   {manage&&<button className="primary" disabled={demo} onClick={()=>{setSelected({...blank,checklist:checklistFor(['Website'])});setNotice('');}}>+ New build</button>}
  </section>

  <div className="builds-toolbar"><label>Search builds<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Company or build name"/></label><button disabled={busy||demo} onClick={()=>{setError('');load().catch(e=>setError(e.message));}}>Refresh</button></div>
  {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}{demo&&<p>Sign in to track live builds.</p>}

  <div className="builds-summary">
   <article><Globe size={17}/><span>Websites</span><strong>{builds.filter(b=>b.build_types?.includes('Website')).length}</strong></article>
   <article><LayoutDashboard size={17}/><span>Back Offices</span><strong>{builds.filter(b=>b.build_types?.includes('Back Office')).length}</strong></article>
   <article><ClipboardCheck size={17}/><span>Client approved</span><strong>{builds.filter(b=>b.client_review_status==='Approved').length}</strong></article>
   <article><CalendarDays size={17}/><span>Due soon</span><strong>{builds.filter(b=>b.target_date&&b.target_date>=new Date().toISOString().slice(0,10)&&b.target_date<=new Date(Date.now()+7*86400000).toISOString().slice(0,10)).length}</strong></article>
  </div>

  <div className="table-wrap builds-table"><table><thead><tr><th>Client / build</th><th>Type</th><th>Content</th><th>Stage</th><th>Assigned to</th><th>Due date</th><th>QA</th><th>Client review</th><th>Ready</th><th>Actions</th></tr></thead><tbody>{builds.filter(b=>(b.title+' '+clientName(b.client_id)).toLowerCase().includes(search.toLowerCase())).map(b=><tr key={b.id}>
   <td><button className="table-title" onClick={()=>{setSelected({...b,checklist:checklistFor(b.build_types?.length?b.build_types:['Back Office'],b.checklist??[])});setNotice('');}}>{clientName(b.client_id)}<small>{b.title}</small></button></td>
   <td>{(b.build_types??[]).join(' + ')}</td>
   <td><span className={'build-pill '+b.content_status.toLowerCase().replaceAll(' ','-')}>{b.content_status}</span></td>
   <td>{b.status}</td><td>{assigneeNames(b)}</td><td>{b.target_date||'No date'}</td><td>{qaProgress(b)}%</td>
   <td><span className={'build-review '+b.client_review_status.toLowerCase().replaceAll(' ','-')}>{b.client_review_status}</span></td>
   <td><strong>{ready(b)?'Ready':'In progress'}</strong></td>
   <td><button className="build-edit-button" onClick={()=>{setSelected({...b,checklist:checklistFor(b.build_types?.length?b.build_types:['Back Office'],b.checklist??[])});setNotice('');}}>Edit</button></td>
  </tr>)}</tbody></table></div>
  {!builds.length&&<p className="empty">No builds registered yet.</p>}

  {selected&&<section className="panel build-editor">
   <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');setNotice('');try{
    const payload={...selected,assignee_id:selected.assignee_ids[0]??null,checklist:checklistFor(selected.build_types,selected.checklist)};
    const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),b=await r.json();
    if(!r.ok)throw Error(b.error);setSelected({...b});await load();setNotice('Build saved.');
   }catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
    <div className="panel-head"><div><span className="eyebrow">BUILD RECORD</span><h2>{selected.id?selected.title:'New website / back office'}</h2><p>{clientName(selected.client_id)}</p></div><button type="button" onClick={()=>setSelected(null)}>Close</button></div>
    <fieldset disabled={!manage||busy||demo}>
     <div className="build-form-grid">
      <label>Client<select required value={selected.client_id??''} onChange={e=>update('client_id',e.target.value||null)}><option value="">Select client</option>{clients.filter(c=>c.status==='active').map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
      <fieldset className="build-type-picker"><legend>Build type</legend>{(['Website','Back Office'] as const).map(type=><label key={type}><input type="checkbox" checked={selected.build_types.includes(type)} onChange={()=>toggleType(type)}/><span>{type}</span></label>)}</fieldset>
      <label>Build name<input required maxLength={160} value={selected.title} onChange={e=>update('title',e.target.value)} placeholder="e.g. JBC Website"/></label>
      <label>Due date<input type="date" value={selected.target_date??''} onChange={e=>update('target_date',e.target.value||null)}/></label>
      <label>Content status<select value={selected.content_status} onChange={e=>update('content_status',e.target.value)}>{contentStages.map(s=><option key={s}>{s}</option>)}</select></label>
      <label>Build stage<select value={selected.status} onChange={e=>update('status',e.target.value)}>{stages.map(s=><option key={s}>{s}</option>)}</select></label>
      <label>Live / staging URL<input type="url" placeholder="https://" value={selected.url} onChange={e=>update('url',e.target.value)}/></label>
      <label>Prototype URL<input type="url" placeholder="https://" value={selected.prototype_url} onChange={e=>update('prototype_url',e.target.value)}/></label>
     </div>

     <fieldset className="build-assignees"><legend><Users size={14}/> Assigned team</legend>{staff.map(s=>{const checked=(selected.assignee_ids??[]).includes(s.user_id);return <label key={s.user_id}><input type="checkbox" checked={checked} onChange={e=>setSelected(v=>v?{...v,assignee_ids:e.target.checked?[...(v.assignee_ids??[]),s.user_id]:(v.assignee_ids??[]).filter(id=>id!==s.user_id)}:v)}/><span>{s.name}</span></label>})}</fieldset>

     <label>Scope / build notes<textarea maxLength={5000} value={selected.description} onChange={e=>update('description',e.target.value)} placeholder="What is included in this build?"/></label>

     <section className="build-qa"><div className="build-section-head"><div><span className="eyebrow">QA CHECKLIST</span><h3>Testing & launch checks</h3></div><strong>{qaProgress(selected)}%</strong></div>
      <div className="build-checklist">{checklistFor(selected.build_types,selected.checklist).map(item=><label key={item.key} className={item.done?'done':''}><input type="checkbox" checked={item.done} onChange={e=>setCheck(item.key,e.target.checked)}/><span>{item.label}</span>{item.done&&<CheckCircle2 size={15}/>}</label>)}</div>
     </section>

     <div className="build-review-grid">
      <label>Client review<select value={selected.client_review_status} onChange={e=>update('client_review_status',e.target.value)}>{clientReviewStages.map(s=><option key={s}>{s}</option>)}</select></label>
      <label>Review / revision notes<textarea maxLength={5000} value={selected.review_notes} onChange={e=>update('review_notes',e.target.value)} placeholder="Client feedback, revisions required, approval notes…"/></label>
     </div>
     <div className="build-options"><label><input type="checkbox" checked={selected.hosting_managed} onChange={e=>update('hosting_managed',e.target.checked)}/> NXT manages hosting</label><label><input type="checkbox" checked={selected.dns_managed} onChange={e=>update('dns_managed',e.target.checked)}/> NXT manages DNS</label></div>
     <div className="build-save-actions"><button className="primary">Save build</button>{selected.id&&manage&&<button type="button" className="danger-button" onClick={async()=>{if(!window.confirm('Delete this website / back office build? This cannot be undone.'))return;setBusy(true);setError('');try{const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',id:selected.id})}),b=await r.json();if(!r.ok)throw Error(b.error);setSelected(null);await load();setNotice('Build deleted.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Delete build</button>}</div>
    </fieldset>
   </form>

   {selected.id&&<section className="build-linked-tickets"><div className="panel-head"><div><h3>Linked tickets</h3><p>Issues filed against this website or back office.</p></div><span>{open(selected.id).length} open</span></div>{linked(selected.id).map(t=><article key={t.id}><strong>{t.reference} — {t.title}</strong><p>{ticketLabel(t.status)} · {t.priority}</p></article>)}{!linked(selected.id).length&&<p className="empty compact">No tickets linked yet.</p>}</section>}
  </section>}
 </section>;
}
