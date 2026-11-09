import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {z} from 'zod';
const text=z.string().trim();
const checklistItem=z.object({key:z.string().trim().min(1).max(80),label:z.string().trim().min(1).max(200),done:z.boolean()}).strict();
const taskItem=z.object({id:z.string().trim().min(1).max(60),label:z.string().trim().min(1).max(200),done:z.boolean()}).strict();
const schema=z.object({
 id:z.uuid().optional(),
 title:text.min(1).max(160),
 description:text.max(5000),
 url:z.union([z.url().refine(s=>/^https?:\/\//.test(s)),z.literal('')]),
 prototype_url:z.union([z.url().refine(s=>/^https?:\/\//.test(s)),z.literal('')]).default(''),
 status:z.enum(['Not started','In progress','Under review','Testing mode','Testing passed','Testing failed']),
 assignee_id:z.uuid().nullable(),
 assignee_ids:z.array(z.uuid()).max(25),
 client_id:z.uuid().nullable(),
 target_date:z.iso.date().nullable(),
 review_notes:text.max(5000),
 build_types:z.array(z.enum(['Website','Back Office'])).min(1).max(2),
 content_status:z.enum(['Not started','Awaiting client','Content received','In progress','Done']),
 client_review_status:z.enum(['Not sent','Awaiting review','Approved','Needs revisions']),
 checklist:z.array(checklistItem).max(50),
 tasks:z.array(taskItem).max(100).default([]),
 hosting_managed:z.boolean().default(false),
 dns_managed:z.boolean().default(false),
 maintenance_plan:z.string().max(1000).nullable().default(null)
}).strict();
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client')return NextResponse.json({error:'Staff access required'},{status:403});
 const tables=['backoffice_builds','it_tickets','staff_directory','clients'];
 const showArchived=req.nextUrl.searchParams.get('archived')==='1';
 const results=await Promise.all(tables.map(async table=>{
  let q=c.db.from(table).select('*').eq('tenant_id',c.workspace!.id);
  if(table==='clients')q=q.is('archived_at',null);
  if(table==='backoffice_builds'&&!showArchived){
   const active=await c.db.from(table).select('*').eq('tenant_id',c.workspace!.id).is('archived_at',null);
   if(!active.error)return active; // before the upgrade the column does not exist, so fall through to the plain list
  }
  return q;
 }));
 const out:Record<string,unknown>={};for(const [i,table] of tables.entries()){if(results[i].error)return NextResponse.json({error:'The back-office builds database upgrade is required.'},{status:400});out[table]=results[i].data??[];}
 return NextResponse.json(out,{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client'||!allowed(c.workspace.role,c.workspace.permissions??[],'tickets'))return NextResponse.json({error:'IT administrator access required'},{status:403});
 const raw=await req.json().catch(()=>null);
 if(raw?.action==='archive'||raw?.action==='restore'){
  // Builds are archived, never deleted, so the history stays.
  const parsed=z.object({action:z.enum(['archive','restore']),id:z.uuid()}).strict().safeParse(raw);
  if(!parsed.success)return NextResponse.json({error:'Choose a valid build.'},{status:400});
  const out=await c.db.from('backoffice_builds').update({archived_at:parsed.data.action==='archive'?new Date().toISOString():null}).eq('tenant_id',c.workspace.id).eq('id',parsed.data.id).select().single();
  return NextResponse.json(out.error?{error:'The builds upgrade (202611090005) has not been applied yet.'}:out.data,{status:out.error?400:200});
 }
 const p=schema.safeParse(raw);if(!p.success)return NextResponse.json({error:p.error.issues.map(i=>i.message).join('; ')},{status:400});
 const {id,...fields}=p.data;
 const save=(f:Record<string,unknown>)=>id?c.db.from('backoffice_builds').update(f).eq('tenant_id',c.workspace!.id).eq('id',id).select().single():c.db.from('backoffice_builds').insert({...f,tenant_id:c.workspace!.id}).select().single();
 let r=await save(fields);
 if(r.error&&/tasks/.test(r.error.message)){const {tasks:_tasks,...rest}=fields;r=await save(rest);} // upgrade not applied yet: save everything else
 return NextResponse.json(r.error?{error:r.error.message}:r.data,{status:r.error?400:200});
}
