import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {z} from 'zod';
const id=z.uuid(),text=z.string().trim(),nullableId=id.nullable();
const phoneInput=z.union([z.string().trim().max(40),z.literal('')]);
function normalizePhone(value?:string){
 const raw=(value??'').trim();if(!raw)return '';
 let cleaned=raw.replace(/[\s().-]/g,'');
 if(cleaned.startsWith('00'))cleaned='+'+cleaned.slice(2);
 else if(cleaned.startsWith('0'))cleaned='+263'+cleaned.slice(1);
 else if(cleaned.startsWith('263'))cleaned='+'+cleaned;
 if(!/^\+[1-9][0-9]{7,14}$/.test(cleaned))throw new Error('Enter a valid mobile number, for example 0771234567 or +263771234567.');
 return cleaned;
}
const update=z.discriminatedUnion('action',[
 z.object({action:z.literal('record'),module:z.enum(['clients','projects','tasks']),id:id.optional(),title:text.min(1).max(160),status:text.max(30),email:z.union([z.email(),z.literal('')]).optional(),phone:phoneInput.optional(),approval_email_enabled:z.boolean().optional(),approval_sms_enabled:z.boolean().optional(),services:z.array(z.enum(['website','back_office','hosting','domain','email','other'])).max(6).optional(),address:text.max(500).optional(),primary_contact:text.max(160).optional(),alternate_contact:text.max(160).optional(),alternate_phone:phoneInput.optional(),alternate_email:z.union([z.email(),z.literal('')]).optional(),social_links:text.max(1000).optional(),description:text.max(5000).optional(),client_id:nullableId.optional(),client_visible:z.boolean().optional(),due_date:z.iso.date().nullable().optional(),assignee_id:nullableId.optional(),project_id:nullableId.optional()}),
 z.object({action:z.literal('client_logo'),id,logo_path:z.string().max(500).nullable()}),
 z.object({action:z.literal('delete'),module:z.enum(['clients','projects','tasks']),id}),
 z.object({action:z.literal('archive'),module:z.enum(['clients','projects','tasks']),id,archived:z.boolean()}),
 z.object({action:z.literal('task_status'),id,status:z.enum(['todo','in_progress','done'])}),
 z.object({action:z.literal('ticket'),backoffice_id:nullableId.optional(),device_id:nullableId.optional(),requested_for_id:nullableId.optional(),assignee_id:nullableId.optional(),title:text.min(1).max(160),description:text.min(1).max(5000),device:text.max(300),category:z.enum(['General IT','Back Office / System','CRM / Pipeline','Projects / Tasks','Finance / Expenses','Accounting','Payroll','Leave / Loans','Tickets / IT Support','SMS / Messaging','Phone / Calling','Marketing / Social','Documents / Files','Account / Login Access','Hardware / Device','Network / Connectivity','Website / Domain','Other','Website Change','Website Bug','Content Update','Hosting / DNS','Billing Query','Back Office Issue','Email Issue','Other Support Request']),client_id:nullableId.optional(),priority:z.enum(['Low','Normal','High','Urgent']),due_date:z.iso.date().nullable().optional()}),
 z.object({action:z.literal('ticket_update'),id,backoffice_id:nullableId.optional(),device_id:nullableId.optional(),requested_for_id:nullableId.optional(),status:z.enum(['New','Assigned','In progress','Waiting','Resolved','Closed']),client_id:nullableId.optional(),assignee_id:nullableId,resolution:text.max(5000),priority:z.enum(['Low','Normal','High','Urgent']),due_date:z.iso.date().nullable().optional()}),
 z.object({action:z.literal('comment'),ticket_id:id,body:text.min(1).max(5000),internal:z.boolean().optional(),minutes:z.number().int().min(1).max(1440).nullable().optional()})]);
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client')return NextResponse.json({error:'Staff access required'},{status:403});
 const out:Record<string,unknown>={user_id:c.user.id};
 const tables=['staff_directory','clients','projects','tasks','it_tickets','it_ticket_comments','cold_call_prospects','cold_call_activities','documents'];
 const results=await Promise.all(tables.map(table=>c.db.from(table).select('*').eq('tenant_id',c.workspace!.id)));
 for(let i=0;i<tables.length;i++){if(results[i].error)return NextResponse.json({error:'Install upgrade-team-operations.sql before opening Operations.'},{status:400});out[tables[i]]=results[i].data??[];}
 out.ticket_manager_ids=await ticketManagerIds(c);
 return NextResponse.json(out,{headers:{'Cache-Control':'private, no-store'}});
}
/** People who can be given a ticket: the workspace owner and anyone holding the tickets capability. */
async function ticketManagerIds(c:NonNullable<Awaited<ReturnType<typeof context>>>){
 const t=c.workspace!.id;
 const [owners,grants]=await Promise.all([c.db.from('memberships').select('user_id').eq('tenant_id',t).eq('role','owner'),c.db.from('member_permissions').select('user_id').eq('tenant_id',t).eq('capability','tickets')]);
 return [...new Set([...(owners.data??[]),...(grants.data??[])].map(r=>r.user_id as string))];
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client')return NextResponse.json({error:'Staff access required'},{status:403});
 const p=update.safeParse(await req.json().catch(()=>null));if(!p.success)return NextResponse.json({error:p.error.issues.map(i=>i.path.includes('phone')?'Enter a valid mobile number, for example 0771234567 or +263771234567.':i.message).join('; ')},{status:400});
 const v=p.data,tenant_id=c.workspace.id;const can=(cap:string)=>allowed(c.workspace!.role,c.workspace!.permissions??[],cap);let r;
 if(v.action==='record'){
 if(!(v.module==='tasks'?(v.id?true:can('task_admin')):can(v.module==='clients'?'crm':'delivery')))return NextResponse.json({error:'Manager access required'},{status:403});
 const states={clients:['active','inactive'],projects:['planned','active','review','completed'],tasks:['todo','in_progress','done']};
 if(!states[v.module].includes(v.status))return NextResponse.json({error:'Invalid status'},{status:400});
 if(v.client_visible&&!v.client_id)return NextResponse.json({error:'Select a client before sharing'},{status:400});
 let fields:Record<string,unknown>={title:v.title,status:v.status};
 if(v.module==='clients'){if(v.approval_email_enabled&&!v.email)return NextResponse.json({error:'Add the client notification email first'},{status:400});if(v.approval_sms_enabled&&!v.phone)return NextResponse.json({error:'Add the client mobile number first'},{status:400});fields={...fields,email:v.email??'',phone:normalizePhone(v.phone),approval_email_enabled:v.approval_email_enabled??false,approval_sms_enabled:v.approval_sms_enabled??false,...(v.services?{services:v.services}:{}),address:v.address??'',primary_contact:v.primary_contact??'',alternate_contact:v.alternate_contact??'',alternate_phone:normalizePhone(v.alternate_phone),alternate_email:v.alternate_email??'',social_links:v.social_links??''};}
 else fields={...fields,description:v.description??'',client_id:v.client_id??null,client_visible:v.client_visible??false,due_date:v.due_date??null,...(v.module==='tasks'?{assignee_id:v.assignee_id??null,project_id:v.project_id??null}:{})};
 if(v.module==='tasks'&&v.project_id){const project=await c.db.from('projects').select('client_id').eq('id',v.project_id).eq('tenant_id',tenant_id).is('archived_at',null).single();if(!project.data||project.data.client_id!==(v.client_id??null))return NextResponse.json({error:'Task and project must use the same client'},{status:400});}
 const saveRecord=(f:Record<string,unknown>)=>v.id?c.db.from(v.module).update(f).eq('tenant_id',tenant_id).eq('id',v.id).select().single():c.db.from(v.module).insert({...f,tenant_id}).select().single();
 r=await saveRecord(fields);
 if(r.error&&v.module==='clients'&&/services/.test(r.error.message)){const {services:_s,...rest}=fields;r=await saveRecord(rest);if(!r.error&&v.services?.length)return NextResponse.json({error:'Saved, but support tickets need the database upgrade (202611090007) before they can be switched on.'},{status:400});}
 }else if(v.action==='client_logo'){
 if(!can('crm'))return NextResponse.json({error:'CRM access required'},{status:403});
 if(v.logo_path&&!v.logo_path.startsWith(tenant_id+'/'+v.id+'/'))return NextResponse.json({error:'Invalid logo path'},{status:400});
 r=await c.db.from('clients').update({logo_path:v.logo_path}).eq('tenant_id',tenant_id).eq('id',v.id).select().single();
 }else if(v.action==='delete'){
 if(!(v.module==='tasks'?can('task_admin'):c.workspace.role==='owner'))return NextResponse.json({error:'Owner access required'},{status:403});
 r=await c.db.from(v.module).delete().eq('tenant_id',tenant_id).eq('id',v.id).not('archived_at','is',null).select().single();
 }else if(v.action==='archive'){
 if(!can(v.module==='clients'?'crm':v.module==='tasks'?'task_admin':'delivery'))return NextResponse.json({error:'Manager access required'},{status:403});
 r=await c.db.from(v.module).update({archived_at:v.archived?new Date().toISOString():null}).eq('tenant_id',tenant_id).eq('id',v.id).select().single();
 }else if(v.action==='task_status')r=await c.db.from('tasks').update({status:v.status}).eq('tenant_id',tenant_id).eq('id',v.id).select().single();
 else if(v.action==='ticket'){
 if(v.assignee_id&&!(await ticketManagerIds(c)).includes(v.assignee_id))return NextResponse.json({error:'Choose a ticket manager to assign this to.'},{status:400});
 const {action,...fields}=v;
 const create=(f:Record<string,unknown>)=>c.db.from('it_tickets').insert({...f,tenant_id,status:v.assignee_id?'Assigned':'New'}).select().single();
 r=await create(fields);
 if(r.error&&/client_id/.test(r.error.message)){const {client_id:_c,...rest}=fields;r=await create(rest);} // upgrade 202611090006 not applied yet
}
 else if(v.action==='ticket_update'){
 if(!can('tickets'))return NextResponse.json({error:'IT ticket manager access required'},{status:403});
 if(v.assignee_id&&!(await ticketManagerIds(c)).includes(v.assignee_id))return NextResponse.json({error:'Assigned to must be a ticket manager.'},{status:400});
 const {action,id,...fields}=v;
 const save=(f:Record<string,unknown>)=>c.db.from('it_tickets').update(f).eq('tenant_id',tenant_id).eq('id',id).select().single();
 r=await save(fields);
 if(r.error&&/client_id/.test(r.error.message)){const {client_id:_c,...rest}=fields;r=await save(rest);}
 }else {
 const {action,internal,minutes,...fields}=v;
 // Internal notes and time are for ticket managers only. They are never quietly sent as a normal reply.
 if((internal||minutes)&&!can('tickets'))return NextResponse.json({error:'Only ticket managers can add internal notes or log time.'},{status:403});
 r=await c.db.from('it_ticket_comments').insert({...fields,tenant_id,...(internal||minutes?{internal:Boolean(internal),minutes:minutes??null}:{})}).select().single();
 if(r.error&&(internal||minutes)&&/internal|minutes/.test(r.error.message))return NextResponse.json({error:'Internal notes and time logging need the tickets upgrade (202611090006) to be applied first.'},{status:400});
}
 return NextResponse.json(r.error?{error:r.error.message}:r.data,{status:r.error?400:200});
}
