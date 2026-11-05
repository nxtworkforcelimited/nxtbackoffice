'use client';
import {useEffect,useState} from 'react';
import type {Workspace} from '@/lib/types';
import {Send,MessageSquareText,CheckCircle2,Clock3,XCircle} from 'lucide-react';

type Client={id:string;contact_code:string|null;title:string;phone:string};
type State={
 enabled:boolean;sender_id:string;
 counts:{queued:number;submitted:number;delivered:number;failed:number};
 clients:Client[];
 recent:{status:string;source_type:string;created_at:string;delivered_at:string|null;error:string|null}[];
};

export default function SmsCenter({workspace}:{workspace:Workspace}){
 const [state,setState]=useState<State|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [clientId,setClientId]=useState(''),[recipient,setRecipient]=useState(''),[message,setMessage]=useState('');
 async function load(){
  const r=await fetch('/api/sms?workspace='+workspace.id,{cache:'no-store'}),b=await r.json();
  if(!r.ok)throw Error(b.error);setState(b);setError('');
 }
 useEffect(()=>{let live=true;async function go(){try{const r=await fetch('/api/sms?workspace='+workspace.id,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);if(live){setState(b);setError('');}}catch(e){if(live)setError((e as Error).message);}}go();const timer=setInterval(go,30000);return()=>{live=false;clearInterval(timer);};},[workspace.id]);
 if(error&&!state)return <p className="notice error">{error}</p>;
 if(!state)return <section className="panel"><p>Loading SMS workspace…</p></section>;

 function chooseClient(id:string){
  setClientId(id);
  const client=state?.clients.find(c=>c.id===id);
  setRecipient(client?.phone||'');
 }
 async function sendSms(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');setNotice('');
  try{
   const r=await fetch('/api/sms?workspace='+workspace.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:clientId||null,recipient,message})}),b=await r.json();
   if(!r.ok)throw Error(b.error);
   setNotice('SMS queued for delivery.');
   setMessage('');await load();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }

 return <section className="sms-workspace">
  <section className="sms-hero">
   <div><span className="eyebrow">SMS</span><h2>Client Messaging</h2><p>Create and send SMS messages from one clean workspace.</p></div>
   <span className="sms-sender-id">Sender ID · {state.sender_id}</span>
  </section>

  <section className="sms-metrics">
   <article><Clock3 size={17}/><span>Queued</span><strong>{state.counts.queued}</strong></article>
   <article><Send size={17}/><span>Submitted</span><strong>{state.counts.submitted}</strong></article>
   <article><CheckCircle2 size={17}/><span>Delivered</span><strong>{state.counts.delivered}</strong></article>
   <article><XCircle size={17}/><span>Failed</span><strong>{state.counts.failed}</strong></article>
  </section>

  <section className="sms-grid">
   <article className="panel sms-compose">
    <div className="panel-head"><div><span className="eyebrow">COMPOSE</span><h3>Create SMS</h3><p>Choose a saved contact or enter a mobile number manually.</p></div><MessageSquareText size={20}/></div>
    {notice&&<p className="notice">{notice}</p>}{error&&<p className="notice error">{error}</p>}
    <form onSubmit={sendSms}><fieldset disabled={busy}>
     <label>Client / contact<select value={clientId} onChange={e=>chooseClient(e.target.value)}><option value="">Manual number</option>{state.clients.map(c=><option key={c.id} value={c.id}>{c.title}{c.contact_code?' · '+c.contact_code:''}{c.phone?' · '+c.phone:' · No mobile'}</option>)}</select></label>
     <label>Mobile number<input required value={recipient} onChange={e=>setRecipient(e.target.value.replace(/\s+/g,''))} placeholder="+2637XXXXXXXX"/></label>
     <label>Message<textarea required maxLength={480} rows={6} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Type your SMS…"/></label>
     <div className="sms-compose-foot"><span>{message.length}/480</span><button className="primary" disabled={busy||!message.trim()||!recipient.trim()}><Send size={14}/>{busy?'Queuing…':'Send SMS'}</button></div>
    </fieldset></form>
   </article>

   <article className="panel sms-activity">
    <div className="panel-head"><div><span className="eyebrow">DELIVERY</span><h3>Recent SMS Activity</h3><p>Latest queued and delivered messages.</p></div></div>
    <div>{!state.recent.length?<p className="empty compact">No SMS activity yet.</p>:state.recent.map((row,i)=><article key={i} className={'sms-activity-row '+row.status}><span><strong>{row.source_type||'SMS'}</strong><small>{new Date(row.created_at).toLocaleString()}</small></span><em>{row.status}</em>{row.error&&<small className="sms-error">{row.error}</small>}</article>)}</div>
   </article>
  </section>
 </section>;
}
