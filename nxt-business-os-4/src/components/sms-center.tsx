'use client';
import {useEffect,useState} from 'react';
import SmsTemplates from './sms-templates';
import SmsComposer from './sms-composer';
import type {SmsDraft} from '@/lib/sms-template';
import type {Workspace} from '@/lib/types';

type State={
 provider:string;enabled:boolean;sender_id:string;batch_size:number;updated_at:string|null;
 ready_clients:number;enabled_without_phone:number;total_clients:number;
 counts:{queued:number;submitted:number;delivered:number;failed:number};
 recent:{status:string;source_type:string;created_at:string;delivered_at:string|null;error:string|null}[];
};

export default function SmsCenter({workspace,initialDraft}:{workspace:Workspace;initialDraft?:SmsDraft}){
 const [tab,setTab]=useState('Send message');
 const [state,setState]=useState<State|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[recipient,setRecipient]=useState(''),[message,setMessage]=useState('NXT Business OS SMS test. If you received this message, Gikko SMS is working.');
 useEffect(()=>{let live=true;async function load(){try{const r=await fetch('/api/sms?workspace='+workspace.id,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);if(live){setState(b);setError('');}}catch(e){if(live)setError((e as Error).message);}}load();const timer=setInterval(load,15000);return()=>{live=false;clearInterval(timer);};},[workspace.id]);
 if(error)return <p className="notice error">{error}</p>;
 if(!state)return <section className="panel"><p>Loading SMS integration status…</p></section>;
 const ready=state.enabled;
 return <div><div className="action-row spaced" role="tablist" aria-label="SMS sections">{['Send message','Templates','Delivery History','Overview'].map(t=><button key={t} type="button" role="tab" aria-selected={tab===t} className={tab===t?'primary':'secondary'} onClick={()=>setTab(t)}>{t}</button>)}</div>{tab==='Send message'?<SmsComposer workspace={workspace.id} initialDraft={initialDraft}/>:tab==='Templates'?<SmsTemplates workspace={workspace.id}/>:<>
  {tab==='Overview'&&<><section className="sms-provider-card">
   <div><span className="eyebrow">SMS PROVIDER</span><h3>Gikko Mobile Messaging</h3>
    <p>{ready?'Automated client SMS delivery is enabled. Approved client-facing work can be queued to Gikko using the saved contact number.':'The Gikko workflow is installed but live sending is disabled until the API key is stored securely and the integration is enabled.'}</p>
   </div><span className={'badge '+(ready?'active':'')}>{ready?'Enabled':'Setup required'}</span>
  </section>
  <div className="studio-metrics">
   <div><span>Sender ID</span><strong>{state.sender_id}</strong><small>{ready?'Active provider sender':'Testing/default sender'}</small></div>
   <div><span>Clients ready</span><strong>{state.ready_clients}</strong><small>SMS alerts enabled + valid number</small></div>
   <div><span>Queued / submitted</span><strong>{state.counts.queued} / {state.counts.submitted}</strong><small>Awaiting or sent to provider</small></div>
   <div><span>Delivered / failed</span><strong>{state.counts.delivered} / {state.counts.failed}</strong><small>Provider delivery state</small></div>
  </div>
  <section className="panel sms-test-panel">
   <h3>Send test SMS</h3><p>Use an internal mobile number in international format to verify live Gikko delivery.</p>
   {notice&&<p className="notice">{notice}</p>}
   <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');setNotice('');try{const r=await fetch('/api/sms?workspace='+workspace.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipient,message})}),b=await r.json();if(!r.ok)throw Error(b.error);setNotice('Test SMS queued. The worker runs every minute; watch Recent SMS Activity below for submitted/failed status.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><div className="form-grid"><label>Mobile number<input required value={recipient} onChange={e=>setRecipient(e.target.value.replace(/\s+/g,''))} placeholder="+2637XXXXXXXX"/></label><label>Message<textarea required maxLength={480} rows={3} value={message} onChange={e=>setMessage(e.target.value)}/></label></div><button className="primary" disabled={busy}>{busy?'Queuing…':'Send test SMS'}</button></form>
  </section>
  <section className="panel">
   <h3>Approval notification workflow</h3>
   <p>When a client-facing project, task or social deliverable reaches its configured approval/review stage, NXT Business OS checks the linked Contact. SMS is queued only when that contact has an international mobile number and <strong>SMS approval alerts</strong> enabled.</p>
   {state.enabled_without_phone>0&&<p className="notice error">{state.enabled_without_phone} contact(s) have SMS alerts enabled but no valid mobile number.</p>}
   {!ready&&<p className="notice">Next activation step: store the Gikko API key in Supabase Vault as <code>gikko_api_key</code>, verify the API host/sender ID, then enable the provider and run one controlled internal test.</p>}
  </section>
  </>}<section className="panel">
   <h3>Recent SMS activity</h3>
   {!state.recent.length?<p>No SMS has been queued yet.</p>:state.recent.map((row,i)=><div className="report-row" key={i}><span>{row.source_type||'SMS'}</span><strong>{row.status}</strong><small>{new Date(row.created_at).toLocaleString()}{row.error?' · '+row.error:''}</small></div>)}
  </section>
 </>}</div>;
}
