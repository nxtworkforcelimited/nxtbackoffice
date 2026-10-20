'use client';
import {useEffect,useState} from 'react';
type Invite={id:string;email:string;status:string;created_at:string;sent_at:string|null;last_error:string|null};
export default function ClientInvite({workspace,clientId,email,title,archived}:{workspace:string;clientId:string;email:string;title:string;archived:boolean}){
 const [history,setHistory]=useState<Invite[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const base='/api/client-invitations?workspace='+workspace+'&client='+clientId;
 async function load(){const r=await fetch(base,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setHistory(b);}
 useEffect(()=>{setHistory([]);setError('');setNotice('');load().catch(e=>setError(e.message));},[base]);
 async function invite(){
 if(!window.confirm(`Email a portal password-setup invitation to ${email} for ${title}? This grants access to work shared with this client.`))return;
 setBusy(true);setError('');setNotice('');try{
 const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:clientId})}),b=await r.json();if(!r.ok)throw Error(b.error);setNotice(b.message);await load();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="panel people-form"><h3>Client portal invitation</h3><p>Send to the saved contact email: <strong>{email||'No email saved'}</strong>. Save any email changes before inviting. Only the workspace owner can send invitations.</p>{error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}<button type="button" className="primary" disabled={busy||!email||archived} onClick={invite}>{busy?'Sending invitation…':history.length?'Resend client invitation':'Invite client'}</button><p>Clients choose their own password and only see work shared with their client account. Sending another link replaces the previous setup link.</p>{history.map(i=><p key={i.id}>{new Date(i.created_at).toLocaleString()} · {i.email} · {i.status==='sent'?'Accepted by email provider':i.status==='failed'?'Failed — retry available':'Preparing'}{i.last_error&&<small>{i.last_error}</small>}</p>)}</section>;
}
