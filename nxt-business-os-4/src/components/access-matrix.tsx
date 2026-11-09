'use client';
import {useEffect,useMemo,useState} from 'react';
import type {Workspace} from '@/lib/types';
import {accessApps} from '@/lib/app-access';
import {ShieldCheck} from 'lucide-react';

type Staff={user_id:string;name:string;email:string;job_title:string;role:string;caps:string[];hidden:string[]};
const sample:Staff[]=[{user_id:'1',name:'Tendai Moyo',email:'tendai@example.com',job_title:'Account manager',role:'staff',caps:['crm','sms'],hidden:['loans']},{user_id:'2',name:'Rudo Chikafu',email:'rudo@example.com',job_title:'Designer',role:'staff',caps:[],hidden:[]}];
const initials=(n:string)=>n.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();

export default function AccessMatrix({workspace,demo=false}:{workspace:Workspace;demo?:boolean}){
 const [staff,setStaff]=useState<Staff[]>(demo?sample:[]),[error,setError]=useState(''),[busy,setBusy]=useState(''),[q,setQ]=useState(''),[open,setOpen]=useState<string|null>(null);
 const base='/api/hidden-apps?workspace='+workspace.id;
 async function load(){const r=await fetch(base+'&all=1',{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setStaff(b.staff);}
 useEffect(()=>{if(!demo&&workspace.role==='owner')load().catch(e=>setError(e.message));},[workspace.id,demo]);// eslint-disable-line react-hooks/exhaustive-deps
 const shown=useMemo(()=>staff.filter(s=>(s.name+s.email).toLowerCase().includes(q.toLowerCase())),[staff,q]);
 if(workspace.role!=='owner')return <p className="notice">Only the workspace owner can open this page.</p>;
 const isOn=(s:Staff,a:typeof accessApps[number])=>s.role==='owner'||('cap' in a?s.caps.includes(a.cap):!s.hidden.includes(a.key));
 async function toggle(s:Staff,a:typeof accessApps[number]){
  const turnOn=!isOn(s,a);setBusy(s.user_id+a.key);setError('');
  try{
   const r='cap' in a
    ?await fetch('/api/permissions?workspace='+workspace.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:s.user_id,capability:a.cap,enabled:turnOn})})
    :await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:s.user_id,app:a.key,hidden:!turnOn})});
   const b=await r.json();if(!r.ok)throw Error(b.error);await load();
  }catch(e){setError((e as Error).message);}finally{setBusy('');}
 }
 const groups=['Everyday','Controlled'] as const;
 return <section className="people-area access-matrix">
  <div className="panel client-sites-empty"><p><ShieldCheck size={16}/> Only you can see this page. Choose what each staff member can open. Switching an app off removes it from their menu. <strong>Controlled</strong> apps also remove the permission itself, so they cannot reach that data. <strong>Everyday</strong> apps are hidden from their menu.</p>
   <label className="access-search">Find a staff member<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Name or email"/></label></div>
  {demo&&<p className="notice">Sample only.</p>}{error&&<p className="notice error" role="alert">{error}</p>}
  <div className="access-list">{shown.map(s=>{const on=accessApps.filter(a=>isOn(s,a)).length,expanded=open===s.user_id||shown.length===1;
   return <article key={s.user_id} className="panel access-card">
    <button type="button" className="access-head" aria-expanded={expanded} onClick={()=>setOpen(expanded&&shown.length!==1?null:s.user_id)}><span className="access-avatar">{initials(s.name||s.email)}</span><span><strong>{s.name||s.email}</strong><small>{s.job_title||'Staff'} · {s.role}</small></span><span className="integration-pill connected">{s.role==='owner'?'Sees everything':on+' of '+accessApps.length+' apps on'}</span></button>
    {expanded&&s.role!=='owner'&&groups.map(g=><div key={g} className="access-group"><h4>{g==='Everyday'?'Everyday apps (menu)':'Controlled apps (permission)'}</h4><div className="access-grid">{accessApps.filter(a=>a.group===g).map(a=>{const checked=isOn(s,a);return <label key={a.key} className={'access-switch '+(checked?'on':'')}><input type="checkbox" role="switch" checked={checked} disabled={demo||busy===s.user_id+a.key} onChange={()=>void toggle(s,a)}/><span>{a.label}</span></label>;})}</div></div>)}
   </article>;})}
   {!shown.length&&<p className="empty">No staff found.</p>}</div>
 </section>;
}
