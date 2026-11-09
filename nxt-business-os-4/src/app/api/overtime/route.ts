import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {trustedRequest} from '@/lib/request-origin';
import {adminClient} from '@/lib/server/admin';
import {overtimeDateOk} from '@/lib/staff-profile';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const cols='id,employee_id,work_date,hours,note,status,review_note,reviewed_at,created_at';

// Overtime: staff log their own; the owner or payroll approver approves. Authorisation is checked here, then the service client does the work.
async function who(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c)return {error:reply({error:'Please sign in.'},401)};
 if(!c.workspace||c.workspace.role==='client')return {error:reply({error:'Staff access required.'},403)};
 const db=adminClient();if(!db)return {error:reply({error:'Not available right now.'},503)};
 const t=c.workspace.id,own=await db.from('employees').select('id,name').eq('tenant_id',t).eq('user_id',c.user.id).maybeSingle();
 return {c,db,t,own:own.data as {id:string;name:string}|null,manage:allowed(c.workspace.role,c.workspace.permissions??[],'payroll')};
}
export async function GET(req:NextRequest){
 const w=await who(req);if('error' in w)return w.error;
 const {db,t,own,manage}=w;
 const norm=(r:Record<string,unknown>)=>({...r,status:r.status??'approved'});
 const mine=own?await db.from('employee_extra_hours').select('*').eq('tenant_id',t).eq('employee_id',own.id).order('work_date',{ascending:false}).limit(100):{data:[],error:null};
 if(mine.error)return reply({error:'Overtime could not load.'},503);
 let queue:unknown[]=[];
 if(manage){
  const all=await db.from('employee_extra_hours').select('*').eq('tenant_id',t).order('work_date',{ascending:false}).limit(300);
  if(all.error)return reply({error:'Overtime could not load.'},503);
  const emps=await db.from('employees').select('id,name,user_id').eq('tenant_id',t);
  const names=new Map((emps.data??[]).map(e=>[e.id as string,e.name as string]));
  queue=(all.data??[]).map(r=>({...norm(r),employee_name:names.get(r.employee_id as string)??'Staff member'}));
 }
 return reply({employee:own,mine:(mine.data??[]).map(r=>norm(r)),manage,queue});
}
const log=z.object({action:z.literal('log'),work_date:z.iso.date(),hours:z.number().min(0.25).max(24),note:z.string().trim().min(1).max(1000)}).strict();
const review=z.object({action:z.literal('review'),id:z.uuid(),decision:z.enum(['approved','rejected']),note:z.string().trim().max(1000).default('')}).strict();
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Open the back office directly and retry this request.'},403);
 const w=await who(req);if('error' in w)return w.error;
 const {c,db,t,own,manage}=w;
 const raw=await req.json().catch(()=>null);
 if(raw?.action==='log'){
  const p=log.safeParse(raw);if(!p.success)return reply({error:'Enter the date, the hours (0.25 to 24) and what the overtime was for.'},400);
  if(!own)return reply({error:'Your staff record is not set up yet. Ask NXT management to add you under Staff.'},400);
  if(!overtimeDateOk(p.data.work_date))return reply({error:'Choose a day that has already happened, within the last 62 days.'},400);
  const pending=await db.from('employee_extra_hours').select('id',{count:'exact',head:true}).eq('tenant_id',t).eq('employee_id',own.id).eq('status','pending');
  if(pending.error)return reply({error:'Overtime needs the database upgrade (202611090010) before it can be logged.'},400);
  if((pending.count??0)>=30)return reply({error:'You have many entries waiting for approval. Please wait for them to be reviewed.'},400);
  const dup=await db.from('employee_extra_hours').select('id',{count:'exact',head:true}).eq('tenant_id',t).eq('employee_id',own.id).eq('work_date',p.data.work_date).neq('status','rejected');
  if((dup.count??0)>=3)return reply({error:'You already have overtime entries for that day.'},400);
  const out=await db.from('employee_extra_hours').insert({tenant_id:t,employee_id:own.id,work_date:p.data.work_date,hours:p.data.hours,note:p.data.note,recorded_by:c.user.id,status:'pending'}).select('*').single();
  return reply(out.error?{error:'The overtime entry could not be saved.'}:out.data,out.error?400:200);
 }
 if(raw?.action==='review'){
  if(!manage)return reply({error:'Only the owner or a payroll approver can approve overtime.'},403);
  const p=review.safeParse(raw);if(!p.success)return reply({error:'Choose approve or reject.'},400);
  const row=await db.from('employee_extra_hours').select('id,employee_id,status').eq('tenant_id',t).eq('id',p.data.id).maybeSingle();
  if(!row.data)return reply({error:'That overtime entry was not found.'},404);
  if((row.data.status??'approved')!=='pending')return reply({error:'That entry has already been reviewed.'},409);
  const emp=await db.from('employees').select('user_id').eq('tenant_id',t).eq('id',row.data.employee_id).maybeSingle();
  if(emp.data?.user_id===c.user.id&&c.workspace!.role!=='owner')return reply({error:'You cannot approve your own overtime. Ask the owner or another approver.'},403);
  if(p.data.decision==='rejected'&&!p.data.note)return reply({error:'Add a short reason when you reject overtime.'},400);
  const out=await db.from('employee_extra_hours').update({status:p.data.decision,reviewed_by:c.user.id,reviewed_at:new Date().toISOString(),review_note:p.data.note}).eq('tenant_id',t).eq('id',p.data.id).eq('status','pending').select('*').single();
  return reply(out.error?{error:'The review could not be saved.'}:out.data,out.error?400:200);
 }
 return reply({error:'Unknown action.'},400);
}
