import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {trustedRequest} from '@/lib/request-origin';
import {adminClient} from '@/lib/server/admin';
import {enqueueStaffReminders} from '@/lib/server/staff-reminders';
import {completeness,dayKey} from '@/lib/staff-profile';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
// Only the fields a person may edit about themselves. Salary, status, job title and the like are never accepted here.
const profileCols='id,name,email,job_title,home_address,emergency_contact,emergency_phone,next_of_kin_relationship,medical_conditions,medical_declared,licence_number,licence_expiry,reminders_paused';

async function who(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c)return {error:reply({error:'Please sign in.'},401)};
 if(!c.workspace||c.workspace.role==='client')return {error:reply({error:'Staff access required.'},403)};
 const db=adminClient();if(!db)return {error:reply({error:'Not available right now.'},503)};
 const perms=c.workspace.permissions??[],role=c.workspace.role;
 return {c,db,t:c.workspace.id,hr:allowed(role,perms,'hr'),payroll:allowed(role,perms,'payroll')};
}
async function filesFor(db:NonNullable<ReturnType<typeof adminClient>>,t:string,ids:string[]){
 if(!ids.length)return new Map<string,{category:string;name:string}[]>();
 const f=await db.from('employee_files').select('employee_id,category,name').eq('tenant_id',t).in('employee_id',ids);
 const m=new Map<string,{category:string;name:string}[]>();
 for(const r of f.data??[]){const l=m.get(r.employee_id as string)??[];l.push({category:r.category as string,name:r.name as string});m.set(r.employee_id as string,l);}
 return m;
}
export async function GET(req:NextRequest){
 const w=await who(req);if('error' in w)return w.error;
 const {c,db,t,hr,payroll}=w;
 if(req.nextUrl.searchParams.get('area')==='board'){
  if(!hr&&!payroll)return reply({error:'HR or payroll access required.'},403);
  const emps=await db.from('employees').select('*').eq('tenant_id',t).eq('status','active').order('name');
  if(emps.error)return reply({error:'Staff profiles could not load.'},503);
  const ids=(emps.data??[]).map(e=>e.id as string),files=await filesFor(db,t,ids);
  const logs=ids.length?await db.from('staff_profile_reminders').select('employee_id,created_at').eq('tenant_id',t).in('employee_id',ids).order('created_at',{ascending:false}):{data:[]};
  const last=new Map<string,string>();for(const l of (logs.data??[]) as {employee_id:string;created_at:string}[])if(!last.has(l.employee_id))last.set(l.employee_id,l.created_at);
  const ranges=payroll&&ids.length?await db.from('employee_salary_ranges').select('employee_id,currency,min_monthly,max_monthly').eq('tenant_id',t):{data:[]};
  const rangeBy=new Map((ranges.data??[] as {employee_id:string}[]).map((r:any)=>[r.employee_id as string,r]));
  return reply({can_hr:hr,can_payroll:payroll,staff:(emps.data??[]).map(e=>{
   const comp=completeness(e,files.get(e.id as string)??[]);
   return {id:e.id,name:e.name,email:e.email,job_title:e.job_title,percent:comp.percent,missing:comp.missing.map(m=>m.label),reminders_paused:Boolean(e.reminders_paused),last_reminder:last.get(e.id as string)??null,licence_expiry:e.licence_expiry??null,range:rangeBy.get(e.id as string)??null};
  })});
 }
 const own=await db.from('employees').select('*').eq('tenant_id',t).eq('user_id',c.user.id).maybeSingle();
 if(!own.data)return reply({employee:null});
 const files=(await filesFor(db,t,[own.data.id as string])).get(own.data.id as string)??[];
 const comp=completeness(own.data,files);
 const e:Record<string,unknown>={};for(const k of profileCols.split(','))e[k]=(own.data as Record<string,unknown>)[k]??(k==='medical_declared'||k==='reminders_paused'?false:k==='licence_expiry'?null:'');
 return reply({employee:e,files,completeness:comp});
}
const text=(n:number)=>z.string().trim().max(n).default('');
const save=z.object({action:z.literal('save'),employee_id:z.uuid().optional(),home_address:text(500),emergency_contact:text(160),emergency_phone:text(40),next_of_kin_relationship:text(80),medical_conditions:text(2000),medical_declared:z.boolean().default(false),licence_number:text(60),licence_expiry:z.union([z.iso.date(),z.literal(''),z.null()]).default(null)}).strict();
const range=z.object({action:z.literal('range'),employee_id:z.uuid(),currency:z.enum(['USD','ZWG','GBP','AUD']),min_monthly:z.number().min(0).max(100000000),max_monthly:z.number().min(0).max(100000000)}).strict();
const remind=z.object({action:z.literal('remind'),employee_id:z.uuid()}).strict();
const pause=z.object({action:z.literal('pause'),employee_id:z.uuid(),paused:z.boolean()}).strict();
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Open the back office directly and retry this request.'},403);
 const w=await who(req);if('error' in w)return w.error;
 const {c,db,t,hr,payroll}=w;
 const raw=await req.json().catch(()=>null);
 const mine=await db.from('employees').select('id').eq('tenant_id',t).eq('user_id',c.user.id).maybeSingle();
 if(raw?.action==='save'){
  const p=save.safeParse(raw);if(!p.success)return reply({error:'Check the details you entered.'},400);
  const {employee_id,licence_expiry,...rest}=p.data;
  const target=employee_id??mine.data?.id;
  if(!target)return reply({error:'Your staff record is not set up yet. Ask NXT management to add you under Staff.'},400);
  if(target!==mine.data?.id&&!hr)return reply({error:'You can only update your own profile.'},403);
  const out=await db.from('employees').update({...rest,licence_expiry:licence_expiry||null}).eq('tenant_id',t).eq('id',target).select(profileCols).single();
  return reply(out.error?{error:'The profile could not be saved. If this keeps happening, the database upgrade (202611090010) may be missing.'}:out.data,out.error?400:200);
 }
 if(raw?.action==='range'){
  if(!payroll)return reply({error:'Only the owner or payroll can set salary ranges.'},403);
  const p=range.safeParse(raw);if(!p.success||p.data.max_monthly<p.data.min_monthly)return reply({error:'Enter a minimum and a maximum, with the maximum not lower than the minimum.'},400);
  const emp=await db.from('employees').select('id').eq('tenant_id',t).eq('id',p.data.employee_id).maybeSingle();
  if(!emp.data)return reply({error:'Choose a staff member.'},404);
  const out=await db.from('employee_salary_ranges').upsert({tenant_id:t,employee_id:p.data.employee_id,currency:p.data.currency,min_monthly:p.data.min_monthly,max_monthly:p.data.max_monthly,updated_by:c.user.id,updated_at:new Date().toISOString()}).select().single();
  return reply(out.error?{error:'The salary range could not be saved. The database upgrade (202611090010) may be missing.'}:out.data,out.error?400:200);
 }
 if(raw?.action==='remind'||raw?.action==='pause'){
  if(!hr)return reply({error:'Only the owner or HR can do this.'},403);
  if(raw.action==='pause'){
   const p=pause.safeParse(raw);if(!p.success)return reply({error:'Invalid request.'},400);
   const out=await db.from('employees').update({reminders_paused:p.data.paused}).eq('tenant_id',t).eq('id',p.data.employee_id).select('id,reminders_paused').single();
   return reply(out.error?{error:'Could not update.'}:out.data,out.error?400:200);
  }
  const p=remind.safeParse(raw);if(!p.success)return reply({error:'Invalid request.'},400);
  const app=process.env.NEXT_PUBLIC_APP_URL||req.nextUrl.origin;
  const r=await enqueueStaffReminders(db,app,new Date(),{tenant:t,employee:p.data.employee_id,key:dayKey(new Date())});
  return reply(r.queued?{queued:true}:{queued:false,message:'Nothing to send. Their profile is complete, they have no email on file, or a reminder already went today.'});
 }
 return reply({error:'Unknown action.'},400);
}
