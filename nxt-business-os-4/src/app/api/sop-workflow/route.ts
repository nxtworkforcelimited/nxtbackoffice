import {NextRequest} from 'next/server';
import {z} from 'zod';
import {context} from '@/lib/context';
import {trustedRequest} from '@/lib/request-origin';
import {sopPlanSchema,validateSopPlan} from '@/lib/sop-workflow';
import {previewToken,verifyPreview} from '@/lib/server/tracker-preview';
export const dynamic='force-dynamic';
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Use the Business OS form.'},403);
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||!['owner','admin','staff'].includes(c.workspace.role))return reply({error:'Internal staff access required.'},403);
  const raw=await req.text();if(raw.length>60000)return reply({error:'Use a smaller workflow request.'},413);const b=JSON.parse(raw),t=c.workspace.id;
  const key=process.env.MASTER_TRACKER_WRITE_SECRET||'';
  if(b.action==='preview'||b.action==='create'){
   const manager=['owner','admin'].includes(c.workspace.role)||['crm','delivery'].every(p=>c.workspace!.permissions?.includes(p));if(!manager)return reply({error:'Client and delivery management access required.'},403);
   const plan=sopPlanSchema.parse(b.plan);validateSopPlan(plan);
   if(b.action==='preview')return reply({token:previewToken(plan,t,c.user.id,key)});
   if(!z.uuid().safeParse(b.requestId).success||typeof b.token!=='string'||!verifyPreview(b.token,plan,t,c.user.id,key))return reply({error:'Preview this exact plan again before creating it.'},409);
   const r=await c.db.rpc('create_sop_workflow',{t,operation_id:b.requestId,v:plan});return reply(r.error?{error:r.error.message}:r.data,r.error?409:200);
  }
  if(b.action==='update'){
   const parsed=z.object({id:z.uuid(),version:z.number().int().positive(),changes:z.record(z.string(),z.unknown())}).parse(b);
   const r=await c.db.rpc('update_sop_task',{t,r:parsed.id,expected_version:parsed.version,changes:parsed.changes});return reply(r.error?{error:r.error.message}:r.data,r.error?409:200);
  }
  if(b.action==='archive'||b.action==='restore'){
   const rows=z.array(z.object({project:z.string().min(1).max(200),id:z.string().min(1).max(200)})).min(1).max(2000).parse(b.records);
   const r=await c.db.rpc('archive_tracker_records',{t,records:rows,restore:b.action==='restore'});return reply(r.error?{error:r.error.message}:r.data,r.error?409:200);
  }
  return reply({error:'Unknown workflow action.'},422);
 }catch(e){return reply({error:e instanceof Error?e.message:'Workflow request failed.'},422);}
}
