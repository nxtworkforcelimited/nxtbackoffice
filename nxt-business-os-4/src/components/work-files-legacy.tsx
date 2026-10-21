'use client';
import {useCallback,useEffect,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {allowed} from '@/lib/business';
import type {Workspace} from '@/lib/types';
import {fileAccept,fileMime,maxFileBytes} from '@/lib/file-formats';
type WorkFile={id:string;name:string;url:string|null;bytes:number|null;document_id:string|null;uploaded_by:string;client_visible:boolean};
type Document={id:string;title:string;client_id:string|null;client_visible:boolean};
export default function WorkFiles({workspace,parent,kind,clientId,parentShared,archived=false,demo=false}:{workspace:Workspace;parent:string;kind:'tasks'|'projects';clientId:string|null;parentShared:boolean;archived?:boolean;demo?:boolean}){
 const [files,setFiles]=useState<WorkFile[]>([]),[documents,setDocuments]=useState<Document[]>([]),[userId,setUserId]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[shared,setShared]=useState(false),[document,setDocument]=useState('');
 const staff=workspace.role!=='client',manage=allowed(workspace.role,workspace.permissions??[],'delivery'),base='/api/work-files?workspace='+workspace.id+'&kind='+kind+'&parent='+parent;
 const load=useCallback(async()=>{if(demo)return;const r=await fetch(base,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setFiles(b.files);setDocuments(b.documents);setUserId(b.user_id);},[base,demo]);
 useEffect(()=>{setFiles([]);setError('');setNotice('');setShared(false);setDocument('');const refresh=()=>load().catch(e=>setError(e.message));refresh();const focus=()=>{if(!documentHidden())refresh();};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[load]);
 function documentHidden(){return globalThis.document.hidden;}
 async function send(method:string,value:unknown){const r=await fetch(base,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}),b=await r.json();if(!r.ok)throw Error(b.error);return b;}
 async function remove(id:string){const r=await fetch(base+'&id='+id,{method:'DELETE'}),b=await r.json();if(!r.ok)throw Error(b.error);}
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();await load();setNotice('Files updated.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function upload(list:FileList|null){if(!list?.length)return;await run(async()=>{
 const db=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
 for(const f of Array.from(list)){
  const mime=fileMime(f.name);if(!mime||f.size===0||f.size>maxFileBytes)throw Error(f.name+': choose a supported file up to 50 MB.');
  const row=await send('POST',{kind,parent,name:f.name,bytes:f.size,client_visible:shared});
  const r=await db.storage.from('project-task-files').upload(row.object_path,f,{contentType:mime,upsert:false});
  if(r.error){await remove(row.id);throw Error(f.name+' did not upload. Please retry.');}
 }
 });}
 async function download(id:string){await run(async()=>{const r=await fetch(base,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);const file=b.files.find((f:WorkFile)=>f.id===id);if(!file?.url)throw Error('File unavailable. Refresh or ask the team to check the upload.');window.location.assign(file.url);});}
 return <section className="panel people-form"><h3>Files and master documents</h3><p>{staff?'Files stay internal unless explicitly shared. Clients can see a shared file only when this task/project is also shared.':'These are the files your team has shared with you.'}</p>{staff&&!parentShared&&<p>This {kind==='tasks'?'task':'project'} is internal, so its files are currently hidden from clients.</p>}{error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}<button type="button" disabled={busy||demo} onClick={()=>run(load)}>Refresh files</button>
 {files.map(f=><article key={f.id}><strong>{f.name}</strong><p>{f.document_id?'Linked from Documents':f.bytes?`${(f.bytes/1048576).toFixed(2)} MB`:'File'}{staff?f.client_visible?' · Marked shared with client':' · Internal':''}</p><div className="action-row"><button type="button" disabled={busy||demo} onClick={()=>download(f.id)}>Download</button>{staff&&!archived&&(manage||f.uploaded_by===userId)&&<><label><input type="checkbox" disabled={busy||!clientId} checked={f.client_visible} onChange={e=>{const value=e.target.checked;if(value&&!window.confirm('Share this file with the selected client when the task/project is shared?'))return;run(async()=>{await send('PATCH',{id:f.id,client_visible:value});});}}/>Shared with client</label><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Remove this attachment? A linked master document will remain in Documents.'))run(()=>remove(f.id));}}>Remove attachment</button></>}</div></article>)}{!files.length&&<p>No files attached.</p>}
 {staff&&!archived&&!demo&&<fieldset disabled={busy}><label><input type="checkbox" checked={shared} disabled={!clientId} onChange={e=>setShared(e.target.checked)}/> Share new attachments with this client</label><label>Upload files · maximum 50 MB each<input type="file" multiple accept={fileAccept} onChange={e=>{upload(e.target.files);e.target.value='';}}/></label><h4>Choose from Documents / master library</h4><p>Upload your master tracker in Documents first, then link it here. A client can only see a linked master document if the document itself is shared with that same client.</p><label>Master document<select value={document} onChange={e=>setDocument(e.target.value)}><option value="">Choose a saved document</option>{documents.filter(d=>d.client_id===null||d.client_id===clientId).map(d=><option key={d.id} value={d.id}>{d.title}{d.client_visible?' · Shared':' · Internal'}</option>)}</select></label><button type="button" disabled={!document||busy} onClick={()=>run(async()=>{await send('POST',{kind,parent,document_id:document,name:'Linked document',bytes:1,client_visible:shared});setDocument('');})}>Attach selected document</button></fieldset>}
 </section>;
}
