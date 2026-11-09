import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {adminClient} from '@/lib/server/admin';
import {approvedHours} from '@/lib/staff-profile';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});

// For the payslip form: approved overtime in the pay period, and the agreed salary range. Payroll approvers and the owner only.
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c)return reply({error:'Please sign in.'},401);
 if(!c.workspace||c.workspace.role==='client'||!allowed(c.workspace.role,c.workspace.permissions??[],'payroll'))return reply({error:'Payroll access required.'},403);
 const p=z.object({employee_id:z.uuid(),from:z.iso.date(),to:z.iso.date()}).safeParse(Object.fromEntries(req.nextUrl.searchParams));
 if(!p.success)return reply({error:'Choose an employee and a pay period.'},400);
 const db=adminClient();if(!db)return reply({error:'Not available right now.'},503);
 const t=c.workspace.id;
 const [ot,range]=await Promise.all([
  db.from('employee_extra_hours').select('work_date,hours,status').eq('tenant_id',t).eq('employee_id',p.data.employee_id).gte('work_date',p.data.from).lte('work_date',p.data.to),
  db.from('employee_salary_ranges').select('currency,min_monthly,max_monthly').eq('tenant_id',t).eq('employee_id',p.data.employee_id).maybeSingle()
 ]);
 const rows=(ot.data??[]).map(r=>({work_date:String(r.work_date),hours:r.hours as number,status:String(r.status??'approved')}));
 return reply({overtime_hours:ot.error?0:approvedHours(rows,p.data.from,p.data.to),pending_hours:ot.error?0:Math.round(rows.filter(r=>r.status==='pending').reduce((s,r)=>s+Number(r.hours),0)*100)/100,range:range.error?null:range.data});
}
