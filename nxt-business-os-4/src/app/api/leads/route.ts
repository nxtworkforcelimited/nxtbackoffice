import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {trustedRequest} from '@/lib/request-origin';
import {leadCsv,leadStatuses} from '@/lib/lead-export';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function access(req:NextRequest){const c=await context(req.nextUrl.searchParams.get('workspace'));return c?.workspace&&c.workspace.role!=='client'&&allowed(c.workspace.role,c.workspace.permissions??[],'crm')?c:null;}
export async function GET(req:NextRequest){
 try{
  const c=await access(req);if(!c?.workspace)return reply({error:'CRM access required.'},403);
  const page=z.coerce.number().int().min(0).max(100000).safeParse(req.nextUrl.searchParams.get('page')??0);
  if(!page.success)return reply({error:'Invalid page.'},400);
  const business=req.nextUrl.searchParams.get('business'),status=req.nextUrl.searchParams.get('status'),exporting=req.nextUrl.searchParams.get('format')==='csv';
  if(business&&!z.uuid().safeParse(business).success)return reply({error:'Invalid business.'},400);
  if(status&&!leadStatuses.includes(status as typeof leadStatuses[number]))return reply({error:'Invalid status.'},400);
  let q=c.db.from('website_leads').select('*',{count:'exact'}).eq('tenant_id',c.workspace.id).order('created_at',{ascending:false}).order('id');
  if(business)q=q.eq('client_id',business);if(status)q=q.eq('status',status);
  const [leads,forms]=await Promise.all([q.range(exporting?0:page.data*50,exporting?999:page.data*50+49),c.db.from('website_lead_forms').select('slug,client_id,business_name').eq('tenant_id',c.workspace.id)]);
  if(leads.error||forms.error)throw new Error('load failed');
  const rows=leads.data.map(r=>({...r,business:forms.data.find(f=>f.client_id===r.client_id)?.business_name??'Business'}));
  if(exporting){if((leads.count??0)>1000)return reply({error:'Filter by business and status to export up to 1,000 leads.'},400);return new Response(leadCsv(rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="business-leads.csv"','Cache-Control':'private, no-store'}});}
  return reply({leads:rows,total:leads.count??0,businesses:forms.data,excelConfigured:!!process.env.LEADS_EXCEL_SYNC_TOKEN});
 }catch{return reply({error:'Leads could not load. Please retry.'},503);}
}
export async function PATCH(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Forbidden'},403);
 try{
  const c=await access(req);if(!c?.workspace)return reply({error:'CRM access required.'},403);
  const p=z.object({id:z.uuid(),status:z.enum(leadStatuses),notes:z.string().max(5000)}).parse(await req.json());
  const {data,error}=await c.db.from('website_leads').update({status:p.status,notes:p.notes,updated_at:new Date().toISOString()}).eq('tenant_id',c.workspace.id).eq('id',p.id).select('id').maybeSingle();
  if(error)throw error;if(!data)return reply({error:'Lead not found.'},404);return reply({ok:true});
 }catch(e){return reply({error:e instanceof z.ZodError?'Check the status and notes.':'The lead could not be updated.'},400);}
}
