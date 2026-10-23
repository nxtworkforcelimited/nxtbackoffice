import {NextRequest} from 'next/server';
import {context} from '@/lib/context';
import {trustedRequest} from '@/lib/request-origin';
import {extractImportFile} from '@/lib/server/import-file';
import {proposeTasks} from '@/lib/task-import';
import {clientTrackerPlan} from '@/lib/client-tracker-plan';
import {previewToken,verifyPreview} from '@/lib/server/tracker-preview';
import {z} from 'zod';
export const dynamic='force-dynamic';export const maxDuration=60;
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
async function access(req:NextRequest){const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||!['owner','admin','staff'].includes(c.workspace.role))return null;return c;}
const canCreate=(c:NonNullable<Awaited<ReturnType<typeof access>>>)=>['owner','admin'].includes(c.workspace!.role)||['crm','delivery'].every(p=>c.workspace!.permissions?.includes(p));
export async function GET(req:NextRequest){try{const c=await access(req);if(!c)return reply({error:'Internal staff access required.'},403);const t=c.workspace!.id;const [staff,clients]=await Promise.all([c.db.from('staff_directory').select('user_id,name,email').eq('tenant_id',t),c.db.from('clients').select('id,title,email').eq('tenant_id',t).is('archived_at',null).order('title')]);if(staff.error||clients.error)return reply({error:'Client setup options could not load.'},503);return reply({staff:staff.data,clients:clients.data,canCreate:canCreate(c)});}catch{return reply({error:'Access could not be verified.'},503);}}
export async function POST(req:NextRequest){if(!trustedRequest(req))return reply({error:'Use the Business OS form.'},403);try{
 const c=await access(req);if(!c)return reply({error:'Internal staff access required.'},403);if(!canCreate(c))return reply({error:'Client and delivery management access required.'},403);const t=c.workspace!.id;
 if(req.headers.get('content-type')?.includes('multipart/form-data')){
  if(Number(req.headers.get('content-length')||0)>4*1024*1024)return reply({error:'Upload a document under 3 MB.'},413);
  const form=await req.formData(),file=form.get('file'),reference=z.iso.date().parse(form.get('reference_date'));if(!(file instanceof File))return reply({error:'Choose a brief or SLA.'},422);const text=await extractImportFile(file);const staff=await c.db.from('staff_directory').select('user_id,name,email').eq('tenant_id',t);if(staff.error)return reply({error:'Staff directory unavailable.'},503);
  const tasks=proposeTasks(text,reference,staff.data??[]).map((task,i)=>({...task,key:'task-'+(i+1),priority:'P1',checks:['Deliver the agreed output and attach evidence.']}));const client=text.match(/(?:^|\n)\s*(?:client|company)\s*:\s*([^\n]{1,160})/i)?.[1]?.trim()||'';
  return reply({client_name:client,tracker_name:client?client+' delivery tracker':'',source_name:file.name,source_text:text,tasks,warnings:['Draft tasks are extracted from text. Review scope, owners and dates. Missing details are left for you to confirm.','No client, tracker or tasks have been saved.']});
 }
 const raw=await req.text();if(raw.length>1000000)return reply({error:'Use a smaller brief.'},413);const body=JSON.parse(raw),plan=clientTrackerPlan.parse(body.plan);
 // Recheck selected owners and client before signing and again inside the database transaction.
 const staff=await c.db.from('staff_directory').select('user_id').eq('tenant_id',t);if(staff.error)return reply({error:'Staff directory unavailable.'},503);const owners=new Set(staff.data.map(s=>s.user_id));if(plan.tasks.some(row=>!owners.has(row.assignee_id)))return reply({error:'Choose an active staff owner for every task.'},422);
 if(plan.client_id){const r=await c.db.from('clients').select('id').eq('tenant_id',t).eq('id',plan.client_id).is('archived_at',null).maybeSingle();if(r.error||!r.data)return reply({error:'Choose an active client in this workspace.'},422);}
 const key=process.env.MASTER_TRACKER_WRITE_SECRET||'';
 if(body.action==='preview')return reply({token:previewToken(plan,t,c.user.id,key),summary:{client:plan.client_name,tracker:plan.tracker_name,tasks:plan.tasks.length,visibility:'Internal only',connection:'Projects, Tasks and Master Tracker'}});
 if(body.action!=='create'||!z.uuid().safeParse(body.request_id).success||typeof body.token!=='string'||!verifyPreview(body.token,plan,t,c.user.id,key))return reply({error:'Preview this exact plan again before saving.'},409);
 const result=await c.db.rpc('create_internal_client_tracker',{t,operation_id:body.request_id,v:plan});if(result.error)return reply({error:result.error.message},409);return reply(result.data);
 }catch(e){return reply({error:e instanceof z.ZodError?e.issues.map(i=>i.message).join('; '):e instanceof Error?e.message:'Could not prepare this tracker.'},422);}}
