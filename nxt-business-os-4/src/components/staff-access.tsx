'use client';
import {useCallback,useEffect,useState} from 'react';
import type {Workspace} from '@/lib/types';
type Member={user_id:string;name:string;email:string;job_title:string;role:string};
type History={id:string;user_id:string;email:string;status:string;created_at:string;sent_at:string|null;last_error:string|null};
type Invite={id:string;email:string;name:string;status:string;created_at:string;sent_at:string|null;last_error:string|null;capabilities:string[];job_title:string};
const appOptions=[
 ['crm','CRM & Pipeline'],['finance','Expenses & Finance'],['delivery','Delivery'],['content','Marketing'],['documents','Documents'],['reports','Reports'],['sms','SMS'],['hr','Employees / HR'],['approve_leave','Leave approvals'],['tickets','Ticket administration'],['task_admin','Task administration'],['accounting','Accounting'],['payroll','Payroll']
] as const;
export default function StaffAccess({workspace}:{workspace:Workspace}){
 const allowed=workspace.role==='owner'||workspace.role==='admin'||(workspace.permissions??[]).includes('hr');
 const [staff,setStaff]=useState<Member[]>([]),[history,setHistory]=useState<History[]>([]),[invites,setInvites]=useState<Invite[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [invite,setInvite]=useState({name:'',email:'',job_title:'Staff Member',department:'NXT Workforce',capabilities:['crm'] as string[]});
 const base='/api/staff-access?workspace='+workspace.id;
 const load=useCallback(async()=>{if(!allowed)return;const r=await fetch(base,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setStaff(b.staff);setHistory(b.history);setInvites(b.invites??[]);setLoading(false);},[base,allowed]);
 useEffect(()=>{if(!allowed)return;const refresh=()=>{if(!document.hidden)load().catch(e=>{setError(e.message);setLoading(false);});};refresh();const timer=setInterval(refresh,10000);return()=>clearInterval(timer);},[load,allowed]);
 async function post(value:any){setBusy(true);setError('');setNotice('');try{const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}),b=await r.json();if(!r.ok)throw Error(b.error);await load();return b;}catch(e){setError((e as Error).message);throw e;}finally{setBusy(false);}}
 async function reset(member:Member){
  if(!window.confirm(`Send a secure password-reset email for ${member.name} (${member.email})?`))return;
  try{const b=await post({action:'reset',user_id:member.user_id});setNotice(`Password-reset request for ${b.email} is ${b.status}.`);}catch{}
 }
 function toggle(cap:string){setInvite(v=>({...v,capabilities:v.capabilities.includes(cap)?v.capabilities.filter(x=>x!==cap):[...v.capabilities,cap]}));}
 if(!allowed)return null;
 const status=(h?:History)=>!h?'No reset requested':h.status==='sent'?'Email accepted by provider':h.status==='queued'?'Queued':h.status==='processing'?'Preparing email':h.status==='failed'?'Needs attention':h.status;
 return <section className="staff-access-stack">
  <section className="panel people-form">
   <h2>Invite staff member</h2><p>Create a staff login and assign app access. Standard staff apps such as Tasks, Cold Calling, Tickets, Loans and Leave are available automatically; select extra controlled apps below.</p>
   {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
   <form onSubmit={e=>{e.preventDefault();post({action:'invite',...invite}).then(()=>{setNotice('Staff invitation queued. The email status will update below.');setInvite({name:'',email:'',job_title:'Staff Member',department:'NXT Workforce',capabilities:['crm']});}).catch(()=>{});}}>
    <fieldset disabled={busy}><div className="form-grid"><label>Name<input required value={invite.name} onChange={e=>setInvite({...invite,name:e.target.value})}/></label><label>Email<input required type="email" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})}/></label><label>Job title<input value={invite.job_title} onChange={e=>setInvite({...invite,job_title:e.target.value})}/></label><label>Department<input value={invite.department} onChange={e=>setInvite({...invite,department:e.target.value})}/></label></div>
    <div className="permission-chips invite-permissions">{appOptions.map(([cap,label])=><label className={'permission-chip '+(invite.capabilities.includes(cap)?'enabled':'')} key={cap}><input type="checkbox" checked={invite.capabilities.includes(cap)} onChange={()=>toggle(cap)}/><span>{label}</span></label>)}</div>
    <button className="primary" disabled={busy}>Send staff invite</button></fieldset>
   </form>
   {!!invites.length&&<div className="table-wrap spaced"><table><thead><tr><th>Invite</th><th>Access</th><th>Status</th></tr></thead><tbody>{invites.slice(0,10).map(i=><tr key={i.id}><td>{i.name}<small>{i.email}</small></td><td>{(i.capabilities??[]).map(x=>x.replaceAll('_',' ')).join(', ')||'Standard staff apps'}</td><td>{i.status}{i.sent_at&&<small>{new Date(i.sent_at).toLocaleString()}</small>}{i.last_error&&<small>{i.last_error}</small>}</td></tr>)}</tbody></table></div>}
  </section>
  <section className="panel people-form"><h2>Staff login help</h2><p>Send an existing staff member a secure link to choose a new password. This does not change their permissions.</p><button type="button" disabled={busy} onClick={()=>load().catch(e=>setError(e.message))}>Refresh email status</button>{loading?<p>Loading staff accounts…</p>:<div className="table-wrap"><table><thead><tr><th>Staff member</th><th>Email</th><th>Latest reset</th><th>Action</th></tr></thead><tbody>{staff.map(member=>{const last=history.find(h=>h.user_id===member.user_id),pending=last&&['queued','processing'].includes(last.status);return <tr key={member.user_id}><td>{member.name}<small>{member.job_title}</small></td><td>{member.email}</td><td>{status(last)}{last?.sent_at&&<small>{new Date(last.sent_at).toLocaleString()}</small>}{last?.last_error&&<small>{last.last_error}</small>}</td><td><button type="button" className="secondary" disabled={busy||!!pending||!member.email} onClick={()=>reset(member)}>Send password reset</button></td></tr>;})}</tbody></table>{!staff.length&&<p>No linked staff accounts yet.</p>}</div>}</section>
 </section>;
}
