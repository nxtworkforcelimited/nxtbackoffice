import type {SupabaseClient} from '@supabase/supabase-js';
import {completeness,reminderEmail,weekKey} from '@/lib/staff-profile';

/**
 * Queue one email per week to each active staff member whose profile is incomplete.
 * Dedupe is the staff_profile_reminders row (unique per person and key), written before the email is queued.
 * Safe to run as often as the notification job runs.
 */
export async function enqueueStaffReminders(db:SupabaseClient,appUrl:string,now=new Date(),only?:{tenant:string;employee:string;key:string}){
 let q=db.from('employees').select('id,tenant_id,name,email,status,home_address,emergency_contact,emergency_phone,medical_conditions,medical_declared,reminders_paused').eq('status','active');
 if(only)q=q.eq('tenant_id',only.tenant).eq('id',only.employee);
 const emps=await q.limit(2000);
 if(emps.error)return {queued:0,skipped:0,error:true};
 const rows=emps.data??[];
 if(!rows.length)return {queued:0,skipped:0};
 const ids=rows.map(r=>r.id as string);
 const files=await db.from('employee_files').select('employee_id,category').in('employee_id',ids);
 if(files.error)return {queued:0,skipped:0,error:true};
 const byEmp=new Map<string,{category:string}[]>();
 for(const f of files.data??[]){const l=byEmp.get(f.employee_id as string)??[];l.push({category:f.category as string});byEmp.set(f.employee_id as string,l);}
 let queued=0,skipped=0;
 for(const e of rows){
  const email=String(e.email??'').trim();
  const c=completeness(e as never,byEmp.get(e.id as string)??[]);
  if(c.complete||!email||(e.reminders_paused&&!only)){skipped++;continue;}
  const key=only?.key??weekKey(now);
  const log=await db.from('staff_profile_reminders').insert({tenant_id:e.tenant_id,employee_id:e.id,reminder_key:key,missing:c.missing.map(m=>m.key)});
  if(log.error){skipped++;continue;} // already reminded for this key (unique), or the upgrade is not applied
  const mail=reminderEmail(String(e.name??''),c.missing,appUrl);
  const out=await db.from('notification_outbox').insert({tenant_id:e.tenant_id,recipient:email,subject:mail.subject,body:mail.body});
  if(out.error){await db.from('staff_profile_reminders').delete().eq('tenant_id',e.tenant_id).eq('employee_id',e.id).eq('reminder_key',key);skipped++;continue;}
  queued++;
 }
 return {queued,skipped};
}
