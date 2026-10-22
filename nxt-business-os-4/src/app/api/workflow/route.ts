import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {trustedRequest} from '@/lib/request-origin';
import {z} from 'zod';
import {proposeTasks} from '@/lib/task-import';
import {extractImportFile} from '@/lib/server/import-file';
export const dynamic='force-dynamic';export const maxDuration=60;
const reply=(b:unknown,s=200)=>NextResponse.json(b,{status:s,headers:{'Cache-Control':'private, no-store'}});
const id=z.uuid(),date=z.iso.date(),nullable=id.nullable().optional();
const record=z.object({id:nullable,title:z.string().trim().min(1).max(160),description:z.string().max(5000).default(''),client_id:nullable,project_id:nullable,assignee_id:nullable,internal_due:date,client_due:date.nullable().optional(),scheduled_start:date,depends_on:nullable,share_on_approval:z.boolean().default(false),source_name:z.string().max(200).optional(),source_excerpt:z.string().max(10000).optional(),dependency_index:z.number().int().min(1).max(99).nullable().optional()}).strict();
export async function GET(req:NextRequest){try{const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace)return reply({error:'Sign in to a workspace.'},401);const t=c.workspace.id;
 const tables=c.workspace.role==='client'?['tasks','projects','portal_messages']:['tasks','projects','clients','staff_directory','work_flow','work_votes','work_reviewers','work_settings','portal_messages'];
 const data:Record<string,unknown>={user_id:c.user.id,workspace:c.workspace};
 for(const table of tables){let q=c.db.from(table).select('*').eq('tenant_id',t);if(['tasks','projects','clients'].includes(table))q=q.is('archived_at',null);const r=await q.limit(1000);if(r.error)return reply({error:'Workflow data could not load. Please retry.'},503);data[table]=r.data;}
 const kind=req.nextUrl.searchParams.get('kind'),parent=req.nextUrl.searchParams.get('parent');if(parent&&id.safeParse(parent).success&&['tasks','projects'].includes(kind??'')){const r=await c.db.from('work_comments').select('*').eq('tenant_id',t).eq('kind',kind!).eq('record_id',parent).order('created_at').limit(500);if(r.error)return reply({error:'Discussion unavailable'},503);data.comments=r.data;}
 return reply(data);}catch{return reply({error:'Your session or connection could not be checked. Please retry.'},503);}}
export async function POST(req:NextRequest){if(!trustedRequest(req))return reply({error:'Untrusted request'},403);try{
 const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace)return reply({error:'Sign in required'},401);const t=c.workspace.id,staff=c.workspace.role!=='client';
 if(req.headers.get('content-type')?.includes('multipart/form-data')){if(!staff)return reply({error:'Staff only'},403);const f=await req.formData(),file=f.get('file'),reference=String(f.get('reference_date')??'');if(!(file instanceof File)||!date.safeParse(reference).success)return reply({error:'Choose a file and reference date'},400);const text=await extractImportFile(file);const d=await c.db.from('staff_directory').select('user_id,name,email').eq('tenant_id',t);return reply({tasks:proposeTasks(text,reference,d.data??[]),source_name:file.name,reference_date:reference,method:'Reviewable text extraction; no external AI service used.'});}
 const raw=await req.json();let r;
 if(raw.action==='extract'){if(!staff)return reply({error:'Staff only'},403);const p=z.object({text:z.string().min(1).max(150000),reference_date:date,source_name:z.string().max(200)}).parse(raw);const d=await c.db.from('staff_directory').select('user_id,name,email').eq('tenant_id',t);return reply({tasks:proposeTasks(p.text,p.reference_date,d.data??[]),source_name:p.source_name,reference_date:p.reference_date,method:'Reviewable text extraction; no external AI service used.'});}
 if(raw.action==='save'){const p=z.object({kind:z.enum(['tasks','projects']),record}).parse(raw);r=await c.db.rpc('save_work',{t,k:p.kind,v:p.record});}
 else if(raw.action==='import'){const p=z.object({request_id:id,source_name:z.string().max(200),entries:z.array(record).min(1).max(100)}).parse(raw);r=await c.db.rpc('commit_task_import',{t,request_id:p.request_id,source_label:p.source_name,entries:p.entries});}
 else if(raw.action==='review'){const p=z.object({flow_id:id,decision:z.enum(['start','submit','approve','changes','complete']),note:z.string().max(3000).default('')}).parse(raw);r=await c.db.rpc('review_work',{t,fid:p.flow_id,a:p.decision,note:p.note});}
 else if(raw.action==='move'){const p=z.object({flow_id:id,stage:z.enum(['not_started','in_progress','under_review','complete'])}).parse(raw);r=await c.db.rpc('move_work_stage',{t,fid:p.flow_id,target_stage:p.stage});}
 else if(raw.action==='comment'){const p=z.object({kind:z.enum(['tasks','projects']),record_id:id,scope:z.enum(['internal','external']),body:z.string().trim().min(1).max(5000),mention_ids:z.array(id).max(25).default([])}).parse(raw);if(p.scope==='external'&&p.mention_ids.length)return reply({error:'Mentions are available in internal team chat only'},400);const {mention_ids,...comment}=p;r=await c.db.from('work_comments').insert({...comment,tenant_id:t}).select().single();if(!r.error&&p.scope==='internal'&&mention_ids.length){const n=await c.db.rpc('notify_work_mentions',{t,comment_id:r.data.id,mentioned:mention_ids});if(n.error)return reply({error:'Message saved, but mention notifications could not be queued.'},503);}}
 else if(raw.action==='message'){const p=z.object({client_id:id,body:z.string().trim().min(1).max(5000)}).parse(raw);r=await c.db.from('portal_messages').insert({...p,tenant_id:t}).select().single();}
 else if(raw.action==='approval_mode'){if(c.workspace.role!=='owner')return reply({error:'Owner only'},403);const p=z.object({mode:z.enum(['all','any'])}).parse(raw);r=await c.db.from('work_settings').upsert({tenant_id:t,approval_mode:p.mode});}
 else return reply({error:'Unknown action'},400);
 return reply(r.error?{error:r.error.message}:r.data??{ok:true},r.error?400:200);
 }catch(e){return reply({error:e instanceof z.ZodError?e.issues.map(i=>i.message).join('; '):(e as Error).message||'Request could not be completed'},400);}}
