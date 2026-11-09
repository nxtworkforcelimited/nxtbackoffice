'use client';
import {useEffect,useState} from 'react';
import type {Workspace} from '@/lib/types';

type Entry={id:string;employee_id:string;work_date:string;hours:number|string;note:string;status:'pending'|'approved'|'rejected';review_note?:string;employee_name?:string};
const today=()=>new Date().toISOString().slice(0,10);
const sample:Entry[]=[{id:'o1',employee_id:'e',work_date:'2026-11-05',hours:2.5,note:'Month-end client deadline',status:'approved'},{id:'o2',employee_id:'e',work_date:'2026-11-07',hours:1,note:'Late call with client',status:'pending'}];
const label={pending:'Waiting for approval',approved:'Approved',rejected:'Not approved'} as const;
const pill=(s:string)=>s==='approved'?'connected':s==='rejected'?'attention':'planned';
const total=(l:Entry[],s:string)=>Math.round(l.filter(e=>e.status===s).reduce((a,e)=>a+Number(e.hours),0)*100)/100;

export default function Overtime({workspace,demo=false}:{workspace:Workspace;demo?:boolean}){
 const [mine,setMine]=useState<Entry[]>(demo?sample:[]),[queue,setQueue]=useState<Entry[]>([]),[manage,setManage]=useState(demo),[hasRecord,setHasRecord]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [f,setF]=useState({work_date:today(),hours:'1',note:''}),[reason,setReason]=useState<Record<string,string>>({});
 const base='/api/overtime?workspace='+workspace.id;
 async function load(){const r=await fetch(base,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setMine(b.mine);setQueue(b.queue??[]);setManage(Boolean(b.manage));setHasRecord(Boolean(b.employee));}
 useEffect(()=>{if(!demo)load().catch(e=>setError(e.message));},[workspace.id,demo]);// eslint-disable-line react-hooks/exhaustive-deps
 async function post(body:Record<string,unknown>){const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),b=await r.json();if(!r.ok)throw Error(b.error);return b;}
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const pending=queue.filter(e=>e.status==='pending');
 return <section className="people-area overtime-area">
  <div className="panel client-sites-empty"><p>Log any extra hours you work. Your manager approves them, and approved hours go into your payslip.</p></div>
  {demo&&<p className="notice">Sample only. Sign in to log real overtime.</p>}
  {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
  {hasRecord&&<form className="panel people-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await post({action:'log',work_date:f.work_date,hours:Number(f.hours),note:f.note});setF({work_date:today(),hours:'1',note:''});setNotice('Overtime sent for approval.');await load();});}}><fieldset disabled={busy||demo}><span className="eyebrow">LOG OVERTIME</span><h3>Add overtime</h3>
   <div className="form-grid"><label>Date worked<input type="date" required max={today()} value={f.work_date} onChange={e=>setF({...f,work_date:e.target.value})}/></label><label>Hours<input type="number" required min="0.25" max="24" step="0.25" value={f.hours} onChange={e=>setF({...f,hours:e.target.value})}/></label></div>
   <label>What was it for?<textarea required maxLength={1000} rows={2} value={f.note} onChange={e=>setF({...f,note:e.target.value})} placeholder="Short reason, for example client deadline"/></label>
   <button className="primary">Send for approval</button></fieldset></form>}
  {!hasRecord&&<p className="notice">Your staff record is not set up yet, so you cannot log overtime. Ask NXT management to add you under Staff.</p>}
  <div className="panel"><div className="build-section-head"><div><span className="eyebrow">MY OVERTIME</span><h3>My entries</h3></div><small>Approved: <strong>{total(mine,'approved')}</strong> h · Waiting: <strong>{total(mine,'pending')}</strong> h</small></div>
   <div className="table-wrap"><table><thead><tr><th>Date</th><th>Hours</th><th>Reason</th><th>Status</th></tr></thead><tbody>{mine.map(e=><tr key={e.id}><td>{new Date(e.work_date+'T00:00:00').toLocaleDateString('en-GB')}</td><td>{e.hours}</td><td>{e.note}{e.review_note&&<small>Manager: {e.review_note}</small>}</td><td><span className={'integration-pill '+pill(e.status)}>{label[e.status]}</span></td></tr>)}{!mine.length&&<tr><td colSpan={4}>No overtime logged yet.</td></tr>}</tbody></table></div></div>
  {manage&&<div className="panel"><div className="build-section-head"><div><span className="eyebrow">APPROVALS</span><h3>Overtime waiting for approval</h3></div><strong>{pending.length}</strong></div>
   <div className="table-wrap"><table><thead><tr><th>Staff</th><th>Date</th><th>Hours</th><th>Reason</th><th>Decision</th></tr></thead><tbody>{pending.map(e=><tr key={e.id}><td>{e.employee_name}</td><td>{new Date(e.work_date+'T00:00:00').toLocaleDateString('en-GB')}</td><td>{e.hours}</td><td>{e.note}</td><td><div className="overtime-decide"><input aria-label="Reason if not approved" placeholder="Reason (needed to reject)" value={reason[e.id]??''} onChange={ev=>setReason({...reason,[e.id]:ev.target.value})}/><button className="primary" disabled={busy||demo} onClick={()=>run(async()=>{await post({action:'review',id:e.id,decision:'approved',note:reason[e.id]??''});setNotice('Approved.');await load();})}>Approve</button><button className="secondary" disabled={busy||demo} onClick={()=>run(async()=>{await post({action:'review',id:e.id,decision:'rejected',note:reason[e.id]??''});setNotice('Not approved.');await load();})}>Reject</button></div></td></tr>)}{!pending.length&&<tr><td colSpan={5}>Nothing is waiting.</td></tr>}</tbody></table></div></div>}
 </section>;
}
