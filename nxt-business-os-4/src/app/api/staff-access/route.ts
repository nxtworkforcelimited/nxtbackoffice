import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {trustedRequest} from '@/lib/request-origin';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));
  if(!c)return reply({error:'Please sign in.'},401);
  if(!c.workspace||c.workspace.role!=='owner')return reply({error:'Only the workspace owner can manage staff access.'},403);
  const t=c.workspace.id;
  const [directory,members,history]=await Promise.all([
   c.db.from('staff_directory').select('user_id,name,email,job_title').eq('tenant_id',t).order('name'),
   c.db.from('memberships').select('user_id,role').eq('tenant_id',t).in('role',['owner','admin','staff']),
   c.db.from('staff_password_reset_requests').select('id,user_id,email,status,created_at,sent_at,last_error').eq('tenant_id',t).order('created_at',{ascending:false}).limit(100)
  ]);
  if(directory.error||members.error||history.error)return reply({error:'Staff access information could not load. Please retry.'},503);
  return reply({staff:(directory.data??[]).filter(d=>(members.data??[]).some(m=>m.user_id===d.user_id)).map(d=>({...d,role:members.data?.find(m=>m.user_id===d.user_id)?.role})),history:history.data??[]});
 }catch{return reply({error:'Staff access is temporarily unavailable.'},503);}
}
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Open the back office directly and retry this request.'},403);
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));
  if(!c)return reply({error:'Please sign in.'},401);
  if(!c.workspace||c.workspace.role!=='owner')return reply({error:'Only the workspace owner can request staff password recovery.'},403);
  const p=z.object({user_id:z.uuid()}).strict().safeParse(await req.json().catch(()=>null));
  if(!p.success)return reply({error:'Choose a staff member.'},400);
  // Uses the owner's existing signed-in session; never impersonates a user or accepts an email/tenant from the form.
  const r=await c.db.rpc('request_staff_password_reset',{t:c.workspace.id,member:p.data.user_id});
  return reply(r.error?{error:r.error.message}:r.data,r.error?400:200);
 }catch{return reply({error:'The reset request could not be confirmed. Refresh its status before trying again.'},503);}
}
