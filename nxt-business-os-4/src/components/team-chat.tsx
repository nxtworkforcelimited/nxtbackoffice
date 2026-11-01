'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {MessageCircle,Send,X} from 'lucide-react';
import type {Workspace} from '@/lib/types';
export default function TeamChat({workspace}:{workspace:Workspace}){
 const [open,setOpen]=useState(false),[data,setData]=useState<any>({messages:[],staff:[]}),[body,setBody]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const end=useRef<HTMLDivElement>(null),base='/api/team-chat?workspace='+workspace.id;
 const load=useCallback(async()=>{const r=await fetch(base,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setData(b);},[base]);
 useEffect(()=>{if(!open)return;load().catch(e=>setError(e.message));const timer=setInterval(()=>{if(!document.hidden)load().catch(()=>{});},5000);return()=>clearInterval(timer);},[open,load]);
 useEffect(()=>{if(open)requestAnimationFrame(()=>end.current?.scrollIntoView({behavior:'smooth'}));},[open,data.messages?.length]);
 const name=(id:string)=>data.staff?.find((s:any)=>s.user_id===id)?.name||'Team member';
 async function send(e:React.FormEvent){e.preventDefault();if(!body.trim())return;setBusy(true);setError('');try{const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body})}),b=await r.json();if(!r.ok)throw Error(b.error);setBody('');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(workspace.role==='client')return null;
 return <div className={'team-chat '+(open?'open':'')}>
  {open&&<section className="team-chat-panel" aria-label="NXT team chat"><header><div><strong>NXT Team Chat</strong><small>Internal staff conversation</small></div><button onClick={()=>setOpen(false)} aria-label="Close team chat"><X size={18}/></button></header><div className="team-chat-thread">{(data.messages??[]).map((m:any)=><article key={m.id} className={m.author_id===data.user_id?'mine':''}><small>{m.author_id===data.user_id?'You':name(m.author_id)} · {new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</small><p>{m.body}</p></article>)}{!(data.messages??[]).length&&<p className="team-chat-empty">No team messages yet.</p>}<div ref={end}/></div>{error&&<p className="team-chat-error">{error}</p>}<form onSubmit={send}><textarea aria-label="Team chat message" rows={2} maxLength={5000} value={body} onChange={e=>setBody(e.target.value)} placeholder="Message the team…"/><button disabled={busy||!body.trim()} aria-label="Send message"><Send size={17}/></button></form></section>}
  <button className="team-chat-fab" onClick={()=>setOpen(v=>!v)} aria-label={open?'Close team chat':'Open team chat'}><MessageCircle size={24}/><span>Team Chat</span></button>
 </div>;
}
