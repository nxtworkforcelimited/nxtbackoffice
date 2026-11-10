'use client';
import {useEffect,useState} from 'react';
import type {Workspace} from '@/lib/types';
import {clientPriorities} from '@/lib/client-support';
import {ticketLabel,ticketComplete} from '@/lib/tickets';

type Ticket={id:string;reference:string;title:string;description:string;category:string;priority:string;status:string;resolution:string;created_at:string;updated_at:string};
type Comment={id:string;ticket_id:string;body:string;created_at:string;from:string};
type State={enabled:boolean;company?:string;categories:string[];tickets:Ticket[];comments:Comment[]};
const sample:State={enabled:true,company:'Your company',categories:['Website Change','Website Bug','Content Update','Billing Query'],tickets:[{id:'s1',reference:'INC0000042',title:'Update opening hours on the contact page',description:'We now close at 4pm on Fridays.',category:'Content Update',priority:'Normal',status:'In progress',resolution:'',created_at:'2026-11-05T09:00:00Z',updated_at:'2026-11-06T09:00:00Z'}],comments:[{id:'c1',ticket_id:'s1',body:'Thanks, we are updating this today.',created_at:'2026-11-06T09:00:00Z',from:'NXT Workforce'}]};

export default function ClientTickets({workspace,demo=false}:{workspace:Workspace;demo?:boolean}){
 const [state,setState]=useState<State|null>(demo?sample:null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [open,setOpen]=useState<string|null>(null),[form,setForm]=useState<{title:string;description:string;category:string;priority:string}|null>(null);
 const base='/api/client-tickets?workspace='+workspace.id;
 async function load(){const r=await fetch(base,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setState(b);}
 useEffect(()=>{if(demo)return;load().catch(e=>setError(e.message));},[workspace.id,demo]);// eslint-disable-line react-hooks/exhaustive-deps
 async function post(body:Record<string,unknown>){
  const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),b=await r.json();
  if(!r.ok)throw Error(b.error);return b;
 }
 if(error&&!state)return <p className="notice error" role="alert">{error}</p>;
 if(!state)return <section className="panel"><p>Loading your support tickets…</p></section>;
 if(!state.enabled)return <section className="panel"><h2>Support tickets</h2><p>Support tickets are not switched on for your account yet. If you would like help with your website, hosting or email, contact NXT Workforce at support@nxt-workforce.com.</p></section>;
 const current=state.tickets.find(t=>t.id===open);
 const thread=state.comments.filter(c=>c.ticket_id===open);
 const when=(v:string)=>new Date(v).toLocaleString('en-GB',{timeZone:'Africa/Harare',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
 return <section className="people-area client-tickets">
  <div className="panel client-tickets-intro"><p>Ask NXT Workforce for a change or report a problem. We reply here and by email.</p><button className="primary" disabled={demo||busy} onClick={()=>{setForm({title:'',description:'',category:state.categories[0],priority:'Normal'});setNotice('');setError('');}}>+ New ticket</button></div>
  {demo&&<p className="notice">Preview only. Clients see their own tickets here.</p>}
  {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}

  {form&&<form className="panel people-form" onSubmit={e=>{e.preventDefault();setBusy(true);setError('');setNotice('');post({action:'create',...form}).then(async b=>{setForm(null);setNotice('Ticket '+(b.reference||'')+' received. We will reply as soon as we can.');await load();}).catch(err=>setError(err.message)).finally(()=>setBusy(false));}}>
   <div className="panel-head"><div><h3>New ticket</h3><p>Tell us what you need. One request per ticket works best.</p></div><button type="button" onClick={()=>setForm(null)}>Cancel</button></div>
   <fieldset disabled={busy}>
    <label>What is this about?<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{state.categories.map(c=><option key={c}>{c}</option>)}</select></label>
    <label>Short title<input required maxLength={160} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Change the phone number on the contact page"/></label>
    <label>Details<textarea required maxLength={5000} rows={6} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="What should change, or what is going wrong? Include the page address if you can."/></label>
    <label>How urgent is it?<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}>{clientPriorities.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
    <button className="primary">Send ticket</button>
   </fieldset>
  </form>}

  <div className="table-wrap"><table><thead><tr><th>Ticket</th><th>Type</th><th>Status</th><th>Raised</th></tr></thead><tbody>{state.tickets.map(t=><tr key={t.id}><td><button className="table-title" onClick={()=>setOpen(t.id)}>{t.reference} · {t.title}</button></td><td>{t.category}</td><td><span className="badge">{ticketLabel(t.status)}</span></td><td>{when(t.created_at)}</td></tr>)}{!state.tickets.length&&<tr><td colSpan={4}>No tickets yet. Use "New ticket" to ask for a change or report a problem.</td></tr>}</tbody></table></div>

  {current&&<section className="panel people-form">
   <div className="panel-head"><div><h3>{current.reference}: {current.title}</h3><p>{current.category} · {current.priority==='High'?'Urgent':current.priority} · raised {when(current.created_at)}</p></div><button onClick={()=>setOpen(null)}>Close</button></div>
   <span className="badge">{ticketLabel(current.status)}</span>
   <p style={{whiteSpace:'pre-wrap'}}>{current.description}</p>
   {current.resolution&&ticketComplete(current.status)&&<p><strong>Outcome:</strong> {current.resolution}</p>}
   <h3>Replies</h3>
   {thread.map(c=><article key={c.id}><small>{c.from} · {when(c.created_at)}</small><p style={{whiteSpace:'pre-wrap'}}>{c.body}</p></article>)}{!thread.length&&<p className="empty compact">No replies yet.</p>}
   {!ticketComplete(current.status)?<form onSubmit={e=>{e.preventDefault();const f=e.currentTarget,body=String(new FormData(f).get('body')??'');setBusy(true);setError('');post({action:'comment',ticket_id:current.id,body}).then(async()=>{f.reset();await load();}).catch(err=>setError(err.message)).finally(()=>setBusy(false));}}><label>Add a reply<textarea required name="body" maxLength={5000} rows={3}/></label><button className="secondary" disabled={busy||demo}>Send reply</button></form>:<p className="empty compact">This ticket is resolved. If the problem is back, raise a new ticket.</p>}
  </section>}
 </section>;
}
