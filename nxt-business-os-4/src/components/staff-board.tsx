'use client';
import {useEffect,useState} from 'react';
import type {Workspace} from '@/lib/types';
import {Mail,PauseCircle,PlayCircle} from 'lucide-react';

type Row={id:string;name:string;email:string;job_title:string;percent:number;missing:string[];reminders_paused:boolean;last_reminder:string|null;licence_expiry:string|null;range:{currency:string;min_monthly:number;max_monthly:number}|null};
const sample:Row[]=[{id:'1',name:'Tendai Moyo',email:'tendai@example.com',job_title:'Account manager',percent:57,missing:['CV','Signed contract','Medical conditions'],reminders_paused:false,last_reminder:'2026-11-03T08:00:00Z',licence_expiry:null,range:{currency:'USD',min_monthly:600,max_monthly:900}},{id:'2',name:'Rudo Chikafu',email:'rudo@example.com',job_title:'Designer',percent:100,missing:[],reminders_paused:false,last_reminder:null,licence_expiry:'2027-03-01',range:null}];

export default function StaffBoard({workspace,demo=false}:{workspace:Workspace;demo?:boolean}){
 const [rows,setRows]=useState<Row[]>(demo?sample:[]),[hr,setHr]=useState(demo),[payroll,setPayroll]=useState(demo),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[edit,setEdit]=useState<Record<string,{currency:string;min:string;max:string}>>({});
 const base='/api/staff-profile?workspace='+workspace.id;
 async function load(){const r=await fetch(base+'&area=board',{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setRows(b.staff);setHr(b.can_hr);setPayroll(b.can_payroll);}
 useEffect(()=>{if(!demo)load().catch(e=>setError(e.message));},[workspace.id,demo]);// eslint-disable-line react-hooks/exhaustive-deps
 async function post(body:Record<string,unknown>){const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),b=await r.json();if(!r.ok)throw Error(b.error);return b;}
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const incomplete=rows.filter(r=>r.percent<100).length;
 return <section className="people-area staff-board">
  <div className="panel client-sites-empty"><p>See who still has missing details or documents. Anyone with an incomplete profile gets an email reminder once a week until it is done. {payroll&&'Set each person\'s salary range here too. It is only visible to you and payroll, and it is checked on their payslip.'}</p>
   <p><strong>{incomplete}</strong> of {rows.length} staff profiles are incomplete.</p></div>
  {demo&&<p className="notice">Sample only.</p>}
  {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
  <div className="staff-board-list">{rows.map(r=>{const ed=edit[r.id]??{currency:r.range?.currency??'USD',min:r.range?String(r.range.min_monthly):'',max:r.range?String(r.range.max_monthly):''};
   return <article key={r.id} className="panel staff-board-card">
    <header><div><h3>{r.name}</h3><small>{r.job_title||'Staff'}{r.email?' · '+r.email:' · no email on file'}</small></div><strong>{r.percent}%</strong></header>
    <div className="client-site-progress" role="progressbar" aria-valuenow={r.percent} aria-valuemin={0} aria-valuemax={100} aria-label={r.name+' profile completeness'}><i style={{width:r.percent+'%'}}/></div>
    {r.missing.length?<p className="staff-missing">{r.missing.map(m=><span key={m} className="integration-pill attention">{m}</span>)}</p>:<p><span className="integration-pill connected">Complete</span></p>}
    <small>{r.last_reminder?'Last reminder '+new Date(r.last_reminder).toLocaleDateString('en-GB'):'No reminder sent yet'}{r.reminders_paused?' · Reminders paused':''}{r.licence_expiry?' · Licence expires '+new Date(r.licence_expiry+'T00:00:00').toLocaleDateString('en-GB'):''}</small>
    {hr&&<div className="action-row"><button className="secondary" disabled={busy||demo||r.percent===100||!r.email} onClick={()=>run(async()=>{const b=await post({action:'remind',employee_id:r.id});setNotice(b.queued?'Reminder queued for '+r.name+'. It goes out with the next email run.':b.message);await load();})}><Mail size={14}/>Send reminder now</button><button className="secondary" disabled={busy||demo} onClick={()=>run(async()=>{await post({action:'pause',employee_id:r.id,paused:!r.reminders_paused});await load();})}>{r.reminders_paused?<><PlayCircle size={14}/>Resume reminders</>:<><PauseCircle size={14}/>Pause reminders</>}</button></div>}
    {payroll&&<form className="staff-range" onSubmit={e=>{e.preventDefault();void run(async()=>{await post({action:'range',employee_id:r.id,currency:ed.currency,min_monthly:Number(ed.min),max_monthly:Number(ed.max)});setNotice('Salary range saved for '+r.name+'.');await load();});}}>
     <strong>Salary range (monthly, private)</strong>
     <div className="form-grid"><label>Currency<select value={ed.currency} onChange={e=>setEdit({...edit,[r.id]:{...ed,currency:e.target.value}})}>{['USD','ZWG','GBP','AUD'].map(c=><option key={c}>{c}</option>)}</select></label><label>From<input type="number" min="0" step="0.01" required value={ed.min} onChange={e=>setEdit({...edit,[r.id]:{...ed,min:e.target.value}})}/></label><label>To<input type="number" min="0" step="0.01" required value={ed.max} onChange={e=>setEdit({...edit,[r.id]:{...ed,max:e.target.value}})}/></label></div>
     <button className="secondary" disabled={busy||demo}>Save range</button></form>}
   </article>;})}
   {!rows.length&&<p className="empty">No active staff records yet.</p>}</div>
 </section>;
}
