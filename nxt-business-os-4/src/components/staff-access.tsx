'use client';
import {useCallback,useEffect,useState} from 'react';
import type {Workspace} from '@/lib/types';
type Member={user_id:string;name:string;email:string;job_title:string;role:string};
type History={id:string;user_id:string;email:string;status:string;created_at:string;sent_at:string|null;last_error:string|null};
export default function StaffAccess({workspace}:{workspace:Workspace}){
 const [staff,setStaff]=useState<Member[]>([]),[history,setHistory]=useState<History[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const base='/api/staff-access?workspace='+workspace.id;
 const load=useCallback(async()=>{if(workspace.role!=='owner')return;const r=await fetch(base,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setStaff(b.staff);setHistory(b.history);setLoading(false);},[base,workspace.role]);
 useEffect(()=>{if(workspace.role!=='owner')return;const refresh=()=>{if(!document.hidden)load().catch(e=>{setError(e.message);setLoading(false);});};refresh();const timer=setInterval(refresh,10000);return()=>clearInterval(timer);},[load,workspace.role]);
 async function reset(member:Member){
  if(!window.confirm(`Send a secure password-reset email for ${member.name} (${member.email})? Their password changes only after they complete the link. Their permissions will not change.`))return;
  setBusy(true);setError('');setNotice('');
  try{const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:member.user_id})}),b=await r.json();if(!r.ok)throw Error(b.error);setNotice(`Password-reset request for ${b.email} is ${b.status}. This is not yet confirmation of inbox delivery. The status below updates automatically.`);await load();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 if(workspace.role!=='owner')return null;
 const status=(h?:History)=>!h?'No reset requested':h.status==='sent'?'Accepted by email provider':h.status==='queued'?'Queued for email delivery':h.status==='processing'?'Preparing reset email':h.status==='failed'?'Needs attention':h.status;
 return <section className="panel people-form"><h2>Staff login help</h2><p>Send an existing staff member a secure link to choose their own password. This does not grant new app permissions or change their password immediately. No passwords or reset links are displayed here.</p>{error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}<button type="button" disabled={busy} onClick={()=>{setError('');load().catch(e=>setError(e.message));}}>Refresh email status</button>{loading?<p>Loading staff accounts…</p>:<div className="table-wrap"><table><thead><tr><th>Staff member</th><th>Email</th><th>Latest reset request</th><th>Action</th></tr></thead><tbody>{staff.map(member=>{const last=history.find(h=>h.user_id===member.user_id),pending=last&&['queued','processing'].includes(last.status);return <tr key={member.user_id}><td>{member.name}<small>{member.job_title}</small></td><td>{member.email}</td><td>{status(last)}{last?.sent_at&&<small>{new Date(last.sent_at).toLocaleString()}</small>}{last?.last_error&&<small>{last.last_error}</small>}</td><td><button type="button" className="secondary" disabled={busy||!!pending||!member.email} onClick={()=>reset(member)}>Send password reset</button></td></tr>;})}</tbody></table>{!staff.length&&<p>No linked staff-directory accounts are available.</p>}</div>}<p>Ask the recipient to check for <strong>Reset your NXT Business OS password</strong>, including Junk/Spam, open the newest email in a normal browser, and choose a new password. A sent email does not confirm that they completed setup.</p></section>;
}
