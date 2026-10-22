'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import type {Workspace} from '@/lib/types';

const mentionHandle=(name:string)=>{
 const parts=name.trim().split(/\s+/).filter(Boolean);
 return '@'+(parts[0]||'Team')+(parts.length>1?'.'+parts[parts.length-1]:'');
};
function MessageBody({body,handles}:{body:string;handles:Set<string>}){
 const parts=body.split(/(@[A-Za-z0-9._-]+)/g);
 return <p className="chat-message-body">{parts.map((part,i)=>handles.has(part.toLowerCase())?<mark className="chat-mention" key={i}>{part}</mark>:<span key={i}>{part}</span>)}</p>;
}
export default function TaskChat({workspace,parent,kind,demo=false}:{workspace:Workspace;parent:string;kind:'tasks'|'projects';demo?:boolean}){
 const [data,setData]=useState<any>({}),[body,setBody]=useState(''),[scope,setScope]=useState(workspace.role==='client'?'external':'internal'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);const base='/api/workflow?workspace='+workspace.id+'&kind='+kind+'&parent='+parent;
 const load=useCallback(async()=>{if(demo)return;const r=await fetch(base,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setData(b);},[base,demo]);
 useEffect(()=>{load().catch(e=>setError(e.message));const timer=setInterval(()=>{if(!document.hidden)load().catch(e=>setError(e.message));},15000);return()=>clearInterval(timer);},[load]);
 const client=workspace.role==='client',reviewer=(data.work_reviewers??[]).some((r:any)=>r.user_id===data.user_id),messages=(data.comments??[]).filter((m:any)=>m.scope===scope);
 const teammates=useMemo(()=>client?[]:(data.staff_directory??[]).filter((s:any)=>s.user_id&&s.user_id!==data.user_id).map((s:any)=>({...s,handle:mentionHandle(s.name||s.email||'Team member')})),[client,data.staff_directory,data.user_id]);
 const handles=useMemo(()=>new Set(teammates.map((s:any)=>s.handle.toLowerCase())),[teammates]);
 function addMention(person:any){const tag=person.handle;setBody(v=>{const trimmed=v.replace(/\s+$/,'');return (trimmed?trimmed+' ':'')+tag+' ';});}
 function mentionIds(){const lower=body.toLowerCase();return teammates.filter((s:any)=>lower.includes(s.handle.toLowerCase())).map((s:any)=>s.user_id);}
 if(demo)return null;
 return <section className="panel people-form task-discussion"><h3>Discussion</h3><div className="action-row chat-tabs">{!client&&<button className={scope==='internal'?'active':''} onClick={()=>setScope('internal')}>Internal team chat</button>}{(client||reviewer)&&<button className={scope==='external'?'active':''} onClick={()=>setScope('external')}>Client conversation</button>}</div>{error&&<p className="notice error">{error}</p>}{notice&&<p className="notice">{notice}</p>}<div className="chat-thread">{messages.map((m:any)=><article key={m.id} className={'chat-message '+(m.author_id===data.user_id?'mine':'')}><small>{m.author_id===data.user_id?'You':(data.staff_directory??[]).find((s:any)=>s.user_id===m.author_id)?.name??'Portal participant'} · {new Date(m.created_at).toLocaleString()}</small><MessageBody body={m.body} handles={handles}/></article>)}{!messages.length&&<p className="chat-empty">No messages in this conversation.</p>}</div><form className="chat-compose" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');setNotice('');try{const ids=scope==='internal'?mentionIds():[];const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'comment',kind,record_id:parent,scope,body,mention_ids:ids})}),b=await r.json();if(!r.ok)throw Error(b.error);setBody('');if(ids.length)setNotice(ids.length===1?'Tagged teammate notified.':ids.length+' tagged teammates notified.');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{scope==='internal'&&teammates.length>0&&<div className="mention-picker"><span>Tag teammate</span>{teammates.map((s:any)=><button type="button" key={s.user_id} onClick={()=>addMention(s)} title={'Tag '+s.name}>{s.handle}</button>)}</div>}<label>{scope==='internal'?'Message your team':'Message the client team'}<textarea required maxLength={5000} value={body} onChange={e=>setBody(e.target.value)} placeholder={scope==='internal'?'Write a message or tag someone with @…':'Write a message'}/></label><button className="primary" disabled={busy||!body.trim()}>Send {scope==='internal'?'internal':'client'} message</button></form></section>;
}
