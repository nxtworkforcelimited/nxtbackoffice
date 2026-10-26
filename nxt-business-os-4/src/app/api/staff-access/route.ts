import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {trustedRequest} from '@/lib/request-origin';
import {capabilities} from '@/lib/business';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
function canManage(c:any){return !!c?.workspace&&(c.workspace.role==='owner'||c.workspace.role==='admin'||(c.workspace.permissions??[]).includes('hr'));}
export async function GET(req:NextRequest){
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));
  if(!c)return reply({error:'Please sign in.'},401);
  if(!canManage(c))return reply({error:'Staff access administration permission required.'},403);
  const t=c.workspace!.id;
  const [directory,members,history,invites]=await Promise.all([
   c.db.from('staff_directory').select('user_id,name,email,job_title').eq('tenant_id',t).order('name'),
   c.db.from('memberships').select('user_id,role').eq('tenant_id',t).in('role',['owner','admin','staff']),
   c.db.from('staff_password_reset_requests').select('id,user_id,email,status,created_at,sent_at,last_error').eq('tenant_id',t).order('created_at',{ascending:false}).limit(100),
   c.db.from('staff_access_requests').select('id,email,name,status,created_at,sent_at,last_error,capabilities,job_title').eq('tenant_id',t).order('created_at',{ascending:false}).limit(50)
  ]);
  if(directory.error||members.error||history.error||invites.error)return reply({error:'Staff access information could not load. Please retry.'},503);
  return reply({staff:(directory.data??[]).filter(d=>(members.data??[]).some(m=>m.user_id===d.user_id)).map(d=>({...d,role:members.data?.find(m=>m.user_id===d.user_id)?.role})),history:history.data??[],invites:invites.data??[]});
 }catch{return reply({error:'Staff access is temporarily unavailable.'},503);}
}
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Open the back office directly and retry this request.'},403);
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));
  if(!c)return reply({error:'Please sign in.'},401);
  if(!canManage(c))return reply({error:'Staff access administration permission required.'},403);
  const raw=await req.json().catch(()=>null);
  if(raw?.action==='invite'){
   const p=z.object({
    action:z.literal('invite'),
    name:z.string().trim().min(1).max(160),
    email:z.email().transform(v=>v.toLowerCase()),
    job_title:z.string().trim().max(160).default('Staff Member'),
    department:z.string().trim().max(160).default('NXT Workforce'),
    capabilities:z.array(z.enum(capabilities)).max(capabilities.length)
   }).strict().safeParse(raw);
   if(!p.success)return reply({error:p.error.issues.map(i=>i.message).join('; ')},400);
   const existing=await c.db.from('memberships').select('user_id').eq('tenant_id',c.workspace!.id);
   if(existing.error)return reply({error:'Could not verify existing staff.'},503);
   const row=await c.db.from('staff_access_requests').insert({
    tenant_id:c.workspace!.id,email:p.data.email,name:p.data.name,preset:'custom',
    capabilities:p.data.capabilities,job_title:p.data.job_title,department:p.data.department,
    requested_by:c.user.id,request_source:'owner_assistant_request'
   }).select('id,email,name,status,capabilities').single();
   return reply(row.error?{error:row.error.message}:row.data,row.error?400:201);
  }
  const p=z.object({action:z.literal('reset').optional(),user_id:z.uuid()}).strict().safeParse(raw);
  if(!p.success)return reply({error:'Choose a staff member.'},400);
  const r=await c.db.rpc('request_staff_password_reset',{t:c.workspace!.id,member:p.data.user_id});
  return reply(r.error?{error:r.error.message}:r.data,r.error?400:200);
 }catch{return reply({error:'The staff-access request could not be completed.'},503);}
}
