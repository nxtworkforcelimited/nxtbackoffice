'use client';
import {useEffect,useMemo,useState} from 'react';
import type {Workspace} from '@/lib/types';
import {Send,MessageSquareText,CheckCircle2,Clock3,XCircle,Save,Archive,Plus} from 'lucide-react';
import {mergeFields,starterTemplates,renderTemplate,missingFields,unknownFields,smsSegments,money,dueDateText,type MergeValues} from '@/lib/sms-templates';

type Client={id:string;contact_code:string|null;title:string;phone:string};
type Invoice={id:string;reference:string;title:string;client_id:string|null;total:number;paid:number;currency:string;due_date:string|null;status:string;receipt_number:string;last_payment:number};
type Template={id:string;name:string;category:string;body:string};
type State={
 enabled:boolean;sender_id:string;company:string;
 counts:{queued:number;submitted:number;delivered:number;failed:number};
 clients:Client[];invoices:Invoice[];templates:Template[];templates_ready:boolean;
 recent:{status:string;source_type:string;created_at:string;delivered_at:string|null;error:string|null;recipient?:string;message?:string;client?:string}[];
};
const categories=['invoice','receipt','reminder','general'] as const;

export default function SmsCenter({workspace}:{workspace:Workspace}){
 const [state,setState]=useState<State|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[night,setNight]=useState(false);
 const [clientId,setClientId]=useState(''),[invoiceId,setInvoiceId]=useState(''),[recipient,setRecipient]=useState(''),[message,setMessage]=useState(''),[templateKey,setTemplateKey]=useState('');
 const [editing,setEditing]=useState<{id?:string;name:string;category:typeof categories[number]}|null>(null);
 async function load(){
  const r=await fetch('/api/sms?workspace='+workspace.id,{cache:'no-store'}),b=await r.json();
  if(!r.ok)throw Error(b.error);setState(b);setError('');
 }
 useEffect(()=>{let live=true;async function go(){try{const r=await fetch('/api/sms?workspace='+workspace.id,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);if(live){setState(b);setError('');}}catch(e){if(live)setError((e as Error).message);}}go();const timer=setInterval(go,30000);return()=>{live=false;clearInterval(timer);};},[workspace.id]);

 const client=state?.clients.find(c=>c.id===clientId);
 const invoice=state?.invoices.find(i=>i.id===invoiceId);
 const values:MergeValues=useMemo(()=>{
  if(!state)return {};
  const v:MergeValues={company:state.company};
  if(client)v.client_name=client.title;
  if(invoice){
   v.invoice_number=invoice.reference;v.amount=money(invoice.currency,invoice.total);
   v.balance=money(invoice.currency,Math.max(0,invoice.total-invoice.paid));
   v.paid=money(invoice.currency,invoice.last_payment||invoice.paid);v.due_date=dueDateText(invoice.due_date);v.receipt_number=invoice.receipt_number;
  }
  return v;
 },[state,client,invoice]);
 if(error&&!state)return <p className="notice error">{error}</p>;
 if(!state)return <section className="panel"><p>Loading SMS workspace…</p></section>;

 const invoicesForClient=state.invoices.filter(i=>!clientId||i.client_id===clientId);
 const preview=renderTemplate(message,values),missing=missingFields(message,values),unknown=unknownFields(message);
 const size=smsSegments(preview);
 const allTemplates=[...state.templates.map(t=>({key:t.id,name:t.name,category:t.category,body:t.body,saved:true})),...starterTemplates.map(t=>({key:'starter:'+t.key,name:t.name,category:t.category,body:t.body,saved:false}))];

 function chooseClient(id:string){
  setClientId(id);setInvoiceId('');
  setRecipient(state?.clients.find(c=>c.id===id)?.phone||'');
 }
 function chooseInvoice(id:string){
  setInvoiceId(id);
  const inv=state?.invoices.find(i=>i.id===id);
  if(inv?.client_id&&inv.client_id!==clientId){setClientId(inv.client_id);setRecipient(state?.clients.find(c=>c.id===inv.client_id)?.phone||recipient);}
 }
 function chooseTemplate(key:string){
  setTemplateKey(key);
  const t=allTemplates.find(x=>x.key===key);
  if(t)setMessage(t.body);
 }
 function insertField(key:string){setMessage(m=>(m+(m&&!m.endsWith(' ')?' ':'')+'{'+key+'}').slice(0,480));}
 async function post(body:Record<string,unknown>){
  const r=await fetch('/api/sms?workspace='+workspace.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),b=await r.json();
  if(!r.ok){const err=Error(b.error) as Error&{quiet?:boolean};err.quiet=Boolean(b.quiet_hours);throw err;}
  return b;
 }
 async function sendSms(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');setNotice('');
  try{
   const saved=state?.templates.find(t=>t.id===templateKey);
   await post({action:'send',client_id:clientId||null,invoice_id:invoiceId||null,template_id:saved?saved.id:null,recipient,message,allow_night:night});
   setNotice('SMS queued for delivery.');setMessage('');setTemplateKey('');setNight(false);await load();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function saveTemplate(e:React.FormEvent){
  e.preventDefault();if(!editing)return;setBusy(true);setError('');setNotice('');
  try{
   const saved=await post({action:'template_save',id:editing.id,name:editing.name,category:editing.category,body:message});
   setNotice('Template saved.');setEditing(null);setTemplateKey(saved.id);await load();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function archiveTemplate(id:string){
  if(!window.confirm('Archive this template? It stops showing here. Messages already sent are not affected.'))return;
  setBusy(true);setError('');setNotice('');
  try{await post({action:'template_archive',id});if(templateKey===id)setTemplateKey('');setNotice('Template archived.');await load();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const canSend=!busy&&Boolean(message.trim())&&Boolean(recipient.trim())&&!unknown.length&&!missing.length&&preview.length<=480;

 return <section className="sms-workspace">
  <section className="sms-hero">
   <div><span className="eyebrow">SMS</span><h2>Client Messaging</h2><p>Send a message from a template. Client and invoice details fill in for you.</p></div>
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
    <div className="panel-head"><div><span className="eyebrow">COMPOSE</span><h3>Create SMS</h3><p>Choose a client, an invoice and a template. Check the preview, then send.</p></div><MessageSquareText size={20}/></div>
    {notice&&<p className="notice">{notice}</p>}{error&&<p className="notice error">{error}</p>}
    <form onSubmit={sendSms}><fieldset disabled={busy}>
     <label>Client / contact<select value={clientId} onChange={e=>chooseClient(e.target.value)}><option value="">Manual number</option>{state.clients.map(c=><option key={c.id} value={c.id}>{c.title}{c.contact_code?' · '+c.contact_code:''}{c.phone?' · '+c.phone:' · No mobile'}</option>)}</select></label>
     <label>Invoice (optional)<select value={invoiceId} onChange={e=>chooseInvoice(e.target.value)}><option value="">No invoice</option>{invoicesForClient.map(i=><option key={i.id} value={i.id}>{i.reference} · {money(i.currency,Math.max(0,i.total-i.paid))} due{i.due_date?' · '+dueDateText(i.due_date):''}</option>)}</select></label>
     <label>Template<select value={templateKey} onChange={e=>chooseTemplate(e.target.value)}><option value="">Write my own</option>{state.templates.length>0&&<optgroup label="Your templates">{state.templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>}<optgroup label="Starter templates">{starterTemplates.map(t=><option key={t.key} value={'starter:'+t.key}>{t.name}</option>)}</optgroup></select></label>
     <label>Mobile number<input required value={recipient} onChange={e=>setRecipient(e.target.value.replace(/\s+/g,''))} placeholder="+2637XXXXXXXX"/></label>
     <label>Message<textarea required maxLength={480} rows={5} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Type your SMS, or pick a template above…"/></label>
     <div className="sms-fields" role="group" aria-label="Insert a detail">{mergeFields.map(f=><button type="button" key={f.key} className="secondary sms-chip" title={f.label} onClick={()=>insertField(f.key)}>{'{'+f.key+'}'}</button>)}</div>
     {message.trim()&&<div className="sms-preview" aria-live="polite"><span className="eyebrow">PREVIEW</span><p>{preview}</p>{unknown.length>0&&<small className="sms-error">Unknown detail {'{'+unknown[0]+'}'}. Use the buttons above.</small>}{!unknown.length&&missing.length>0&&<small className="sms-error">Still needs {missing.map(k=>'{'+k+'}').join(', ')}. {missing.some(k=>['client_name'].includes(k))?'Pick a client. ':''}{missing.some(k=>['invoice_number','amount','balance','paid','due_date','receipt_number'].includes(k))?'Pick an invoice. ':''}{missing.includes('receipt_number')&&invoice&&!invoice.receipt_number?'This invoice has no payment recorded yet, so there is no receipt.':''}</small>}</div>}
     <label className="sms-night"><input type="checkbox" checked={night} onChange={e=>setNight(e.target.checked)}/> Send anyway if it is night (8pm to 7am Harare)</label>
     <div className="sms-compose-foot"><span>{size.length} characters · {size.segments||0} SMS{size.unicode?' (special characters make messages shorter)':''}</span><button className="primary" disabled={!canSend}><Send size={14}/>{busy?'Queuing…':'Send SMS'}</button></div>
     <div className="action-row"><button type="button" className="secondary" disabled={!message.trim()||!state.templates_ready} onClick={()=>{const cur=state.templates.find(t=>t.id===templateKey);setEditing({id:cur?.id,name:cur?.name||'',category:(cur?.category as typeof categories[number])||'general'});}}><Save size={14}/>{state.templates.find(t=>t.id===templateKey)?'Update this template':'Save as template'}</button></div>
    </fieldset></form>
    {editing&&<form className="sms-save" onSubmit={saveTemplate}><fieldset disabled={busy}>
     <label>Template name<input required maxLength={80} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})} placeholder="e.g. Invoice processed"/></label>
     <label>Type<select value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value as typeof categories[number]})}>{categories.map(c=><option key={c} value={c}>{c[0].toUpperCase()+c.slice(1)}</option>)}</select></label>
     <div className="action-row"><button className="primary"><Plus size={14}/>Save template</button><button type="button" className="secondary" onClick={()=>setEditing(null)}>Cancel</button></div>
    </fieldset></form>}
    {!state.templates_ready&&<p className="notice">Saving your own templates needs the SMS templates database update. The starter templates work now.</p>}
   </article>

   <article className="panel sms-activity">
    <div className="panel-head"><div><span className="eyebrow">TEMPLATES</span><h3>Your templates</h3><p>Starter templates are always available. Save your own from the compose box.</p></div></div>
    <div>{!state.templates.length?<p className="empty compact">No saved templates yet.</p>:state.templates.map(t=><article key={t.id} className="sms-activity-row"><span><strong>{t.name}</strong><small>{t.category} · {t.body.slice(0,90)}{t.body.length>90?'…':''}</small></span><button type="button" className="secondary" disabled={busy} onClick={()=>chooseTemplate(t.id)}>Use</button><button type="button" className="secondary" disabled={busy} title="Archive template" aria-label={'Archive '+t.name} onClick={()=>archiveTemplate(t.id)}><Archive size={14}/></button></article>)}</div>
    <div className="panel-head" style={{marginTop:18}}><div><span className="eyebrow">DELIVERY</span><h3>Recent SMS Activity</h3><p>Who got what, and whether it arrived.</p></div></div>
    <div>{!state.recent.length?<p className="empty compact">No SMS activity yet.</p>:state.recent.map((row,i)=><article key={i} className={'sms-activity-row '+row.status}><span><strong>{row.client||row.recipient||row.source_type||'SMS'}</strong><small>{row.recipient?row.recipient+' · ':''}{new Date(row.created_at).toLocaleString()}</small>{row.message&&<small>{row.message}</small>}</span><em>{row.status}</em>{row.error&&<small className="sms-error">{row.error}</small>}</article>)}</div>
   </article>
  </section>
 </section>;
}
