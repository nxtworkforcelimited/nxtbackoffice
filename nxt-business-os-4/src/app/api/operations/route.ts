import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {z} from 'zod';
const id=z.uuid(),text=z.string().trim(),nullableId=id.nullable();
const update=z.discriminatedUnion('action',[
 z.object({action:z.literal('record'),module:z.enum(['clients','projects','tasks']),id:id.optional(),title:text.min(1).max(160),status:text.max(30),email:z.union([z.email(),z.literal('')]).optional(),approval_email_enabled:z.boolean().optional(),description:text.max(5000).optional(),client_id:nullableId.optional(),client_visible:z.boolean().optional(),due_date:z.iso.date().nullable().optional(),assignee_id:nullableId.optional(),project_id:nullableId.optional()}),
 z.object({action:z.literal('delete'),module:z.enum(['clients','projects','tasks']),id}),
 z.object({action:z.literal('archive'),module:z.enum(['clients','projects','tasks']),id,archived:z.boolean()}),
 z.object({action:z.literal('task_status'),id,status:z.enum(['todo','in_progress','done'])}),
 z.object({action:z.literal('ticket'),backoffice_id:nullableId.optional(),device_id:nullableId.optional(),title:text.min(1).max(160),description:text.min(1).max(5000),device:text.max(300),category:z.enum(['Hardware','Software','Network','Account access','Other']),priority:z.enum(['Low','Normal','High','Urgent'])}),
 z.object({action:z.literal('ticket_update'),id,backoffice_id:nullableId.optional(),device_id:nullableId.optional(),status:z.enum(['New','Assigned','In progress','Waiting','Resolved','Closed']),assignee_id:nullableId,resolution:text.max(5000),priority:z.enum(['Low','Normal','High','Urgent'])}),
 z.object({action:z.literal('comment'),ticket_id:id,body:text.min(1).max(5000)})]);
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client')return NextResponse.json({error:'Staff access required'},{status:403});
 const out:Record<string,unknown>={user_id:c.user.id};
 const tables=['staff_directory','clients','projects','tasks','it_tickets','it_ticket_comments'];
 const results=await Promise.all(tables.map(table=>c.db.from(table).select('*').eq('tenant_id',c.workspace!.id)));
 for(let i=0;i<tables.length;i++){if(results[i].error)return NextResponse.json({error:'Install upgrade-team-operations.sql before opening Operations.'},{status:400});out[tables[i]]=results[i].data??[];}
 return NextResponse.json(out,{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client')return NextResponse.json({error:'Staff access required'},{status:403});
 const p=update.safeParse(await req.json().catch(()=>null));if(!p.success)return NextResponse.json({error:p.error.issues.map(i=>i.message).join('; ')},{status:400});
 const v=p.data,tenant_id=c.workspace.id;const can=(cap:string)=>allowed(c.workspace!.role,c.workspace!.permissions??[],cap);let r;
 if(v.action==='record'){
 if(!(v.module==='tasks'?(v.id?true:can('task_admin')):can(v.module==='clients'?'crm':'delivery')))return NextResponse.json({error:'Manager access required'},{status:403});
 const states={clients:['active','inactive'],projects:['planned','active','review','completed'],tasks:['todo','in_progress','done']};
 if(!states[v.module].includes(v.status))return NextResponse.json({error:'Invalid status'},{status:400});
 if(v.client_visible&&!v.client_id)return NextResponse.json({error:'Select a client before sharing'},{status:400});
 let fields:Record<string,unknown>={title:v.title,status:v.status};
 if(v.module==='clients'){if(v.approval_email_enabled&&!v.email)return NextResponse.json({error:'Add the client notification email first'},{status:400});fields={...fields,email:v.email??'',approval_email_enabled:v.approval_email_enabled??false};}
 else fields={...fields,description:v.description??'',client_id:v.client_id??null,client_visible:v.client_visible??false,due_date:v.due_date??null,...(v.module==='tasks'?{assignee_id:v.assignee_id??null,project_id:v.project_id??null}:{})};
 if(v.module==='tasks'&&v.project_id){const project=await c.db.from('projects').select('client_id').eq('id',v.project_id).eq('tenant_id',tenant_id).is('archived_at',null).single();if(!project.data||project.data.client_id!==(v.client_id??null))return NextResponse.json({error:'Task and project must use the same client'},{status:400});}
 r=v.id?await c.db.from(v.module).update(fields).eq('tenant_id',tenant_id).eq('id',v.id).select().single():await c.db.from(v.module).insert({...fields,tenant_id}).select().single();
 }else if(v.action==='delete'){
 if(!(v.module==='tasks'?can('task_admin'):c.workspace.role==='owner'))return NextResponse.json({error:'Owner access required'},{status:403});
 r=await c.db.from(v.module).delete().eq('tenant_id',tenant_id).eq('id',v.id).not('archived_at','is',null).select().single();
 }else if(v.action==='archive'){
 if(!can(v.module==='clients'?'crm':v.module==='tasks'?'task_admin':'delivery'))return NextResponse.json({error:'Manager access required'},{status:403});
 r=await c.db.from(v.module).update({archived_at:v.archived?new Date().toISOString():null}).eq('tenant_id',tenant_id).eq('id',v.id).select().single();
 }else if(v.action==='task_status')r=await c.db.from('tasks').update({status:v.status}).eq('tenant_id',tenant_id).eq('id',v.id).select().single();
 else if(v.action==='ticket'){const {action,...fields}=v;r=await c.db.from('it_tickets').insert({...fields,tenant_id}).select().single();}
 else if(v.action==='ticket_update'){
 if(!can('tickets'))return NextResponse.json({error:'IT ticket manager access required'},{status:403});
 const {action,id,...fields}=v;r=await c.db.from('it_tickets').update(fields).eq('tenant_id',tenant_id).eq('id',id).select().single();
 }else {const {action,...fields}=v;r=await c.db.from('it_ticket_comments').insert({...fields,tenant_id}).select().single();}
 return NextResponse.json(r.error?{error:r.error.message}:r.data,{status:r.error?400:200});
}
