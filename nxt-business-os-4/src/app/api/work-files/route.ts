import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {fileMime,maxFileBytes} from '@/lib/file-formats';
import {z} from 'zod';
const id=z.uuid();
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace)return NextResponse.json({error:'Sign in required'},{status:401});
 const kind=req.nextUrl.searchParams.get('kind'),parent=req.nextUrl.searchParams.get('parent');
 if(!['tasks','projects'].includes(kind??'')||!id.safeParse(parent).success)return NextResponse.json({error:'Select a task or project'},{status:400});
 const r=await c.db.from('work_files').select('*').eq('tenant_id',c.workspace.id).eq(kind==='tasks'?'task_id':'project_id',parent!).order('created_at');
 if(r.error)return NextResponse.json({error:'Task/project file storage is not configured.'},{status:400});
 const files=await Promise.all((r.data??[]).map(async f=>{
 let path=f.object_path,bucket='project-task-files';
 if(f.document_id){const d=await c.db.from('documents').select('object_path').eq('id',f.document_id).eq('tenant_id',c.workspace!.id).single();path=d.data?.object_path;bucket='workspace-documents';}
 const signed=path?await c.db.storage.from(bucket).createSignedUrl(path,60,{download:f.name}):null;
 return {...f,url:signed?.data?.signedUrl??null};
 }));
 let documents:unknown[]=[];if(c.workspace.role!=='client'){const d=await c.db.from('documents').select('id,title,client_id,client_visible').eq('tenant_id',c.workspace.id).order('title');documents=d.data??[];}
 return NextResponse.json({files,documents,user_id:c.user.id},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client')return NextResponse.json({error:'Staff access required'},{status:403});
 const p=z.object({kind:z.enum(['tasks','projects']),parent:id,document_id:id.optional(),name:z.string().trim().min(1).max(200),bytes:z.number().int().min(1).max(maxFileBytes),client_visible:z.boolean().default(false)}).safeParse(await req.json().catch(()=>null));
 if(!p.success)return NextResponse.json({error:'Select a supported file, maximum 50 MB.'},{status:400});
 const v=p.data,file_id=crypto.randomUUID();let mime:string|null=fileMime(v.name);let name=v.name,bytes=v.bytes;
 if(v.document_id){const d=await c.db.from('documents').select('title,object_path').eq('id',v.document_id).eq('tenant_id',c.workspace.id).single();if(!d.data?.object_path)return NextResponse.json({error:'Source document unavailable'},{status:400});name=d.data.title;mime=null;bytes=1;}
 if(!mime&&!v.document_id)return NextResponse.json({error:'Use PDF, Office documents, CSV, images or MP4/WebM.'},{status:400});
 const r=await c.db.from('work_files').insert({id:file_id,tenant_id:c.workspace.id,[v.kind==='tasks'?'task_id':'project_id']:v.parent,document_id:v.document_id??null,object_path:v.document_id?null:`${c.workspace.id}/${file_id}`,name,mime,bytes:v.document_id?null:bytes,client_visible:v.client_visible}).select().single();
 return NextResponse.json(r.error?{error:r.error.message}:r.data,{status:r.error?400:201});
}
export async function PATCH(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client')return NextResponse.json({error:'Staff access required'},{status:403});
 const p=z.object({id,client_visible:z.boolean()}).safeParse(await req.json().catch(()=>null));if(!p.success)return NextResponse.json({error:'Invalid file'},{status:400});
 const r=await c.db.from('work_files').update({client_visible:p.data.client_visible}).eq('id',p.data.id).eq('tenant_id',c.workspace.id).select().single();return NextResponse.json(r.error?{error:r.error.message}:{ok:true},{status:r.error?400:200});
}
export async function DELETE(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client')return NextResponse.json({error:'Staff access required'},{status:403});
 const file=id.safeParse(req.nextUrl.searchParams.get('id'));if(!file.success)return NextResponse.json({error:'Invalid file'},{status:400});
 const r=await c.db.from('work_files').delete().eq('id',file.data).eq('tenant_id',c.workspace.id).select().single();
 return NextResponse.json(r.error?{error:r.error.message}:{ok:true},{status:r.error?400:200});
}
