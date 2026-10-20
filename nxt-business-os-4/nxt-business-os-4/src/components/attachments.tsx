 'use client';
import {useEffect,useState,useCallback} from 'react';
import {createBrowserClient} from '@supabase/ssr';
type Attachment={id:string;name:string;mime:string;object_path:string;url:string|null;position:number};
export default function Attachments({workspace,parent,kind,editable,demo=false}:{workspace:string;parent:string;kind:'post'|'request';editable:boolean;demo?:boolean}){
 const [files,setFiles]=useState<Attachment[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const base=`/api/attachments?workspace=${workspace}&kind=${kind}&id=${parent}`;
 const load=useCallback(async()=>{if(demo)return;try{const r=await fetch(base,{cache:'no-store'});const b=await r.json();if(!r.ok)throw new Error(b.error);setFiles(b);}catch(e){setError((e as Error).message);}},[base,demo]);
 useEffect(()=>{load();const t=setInterval(()=>{if(!document.hidden&&!busy)load();},15000);return()=>clearInterval(t);},[load,busy]);
 async function upload(list:FileList|null){if(!list?.length)return;if(demo){setError('File uploads require your connected workspace.');return;}
 setBusy(true);setError('');
 try{
 const db=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
 let position=files.reduce((max,f)=>Math.max(max,f.position+1),0);
 for(const f of Array.from(list)){
 if(f.size>50*1024*1024)throw new Error(`${f.name}: maximum 50 MB per file.`);
 const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,parent,name:f.name,mime:f.type,bytes:f.size,position:position++})});const b=await r.json();if(!r.ok)throw new Error(b.error);
 const result=await db.storage.from('work-attachments').upload(b.object_path,f,{contentType:f.type,upsert:false});
 if(result.error){await fetch(`/api/attachments?workspace=${workspace}&id=${b.id}`,{method:'DELETE'});throw new Error(`${f.name} did not upload: ${result.error.message}. Select it again to retry.`);}
 }
 }catch(e){setError((e as Error).message);}finally{setBusy(false);await load();}
 }
 return <section className="work-attachments"><h3>{kind==='post'?'Artwork and video':'Attachments'}</h3><p className="footnote">{kind==='post'?'Images appear in carousel order. Approval covers the caption and these files.':'Files are shared with the people who can access this request.'}</p>
 <div className="attachment-grid">{files.map((f,i)=><figure key={f.id}>{f.url?f.mime.startsWith('image/')?<a href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.name}/></a>:f.mime.startsWith('video/')?<video controls preload="metadata" src={f.url}/>:<a href={f.url} target="_blank" rel="noreferrer">Open document</a>:<p>Upload incomplete</p>}<figcaption>{i+1}. {f.name}</figcaption>{editable&&<button type="button" disabled={busy} className="text-button" onClick={async()=>{setBusy(true);try{const r=await fetch(`/api/attachments?workspace=${workspace}&id=${f.id}`,{method:'DELETE'});const b=await r.json();if(!r.ok)throw new Error(b.error);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Remove</button>}</figure>)}</div>
 {!files.length&&<p className="footnote">No attachments yet.</p>}
 {editable&&<label>{busy?'Uploading…':'Add files (up to 50 MB each)'}<input type="file" multiple disabled={busy} accept={kind==='post'?'.jpg,.jpeg,.png,.webp,.mp4,.webm':'.jpg,.jpeg,.png,.webp,.mp4,.webm,.pdf,.txt,.docx,.xlsx'} onChange={e=>{upload(e.target.files);e.target.value='';}}/></label>}{error&&<p className="notice error" role="alert">{error}</p>}</section>;
}
