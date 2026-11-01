import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {canManageDomains,domainStatuses} from '@/lib/domain-operations';
import {trustedRequest} from '@/lib/request-origin';
import {z} from 'zod';

const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const update=z.object({id:z.uuid(),version:z.number().int().nonnegative(),status:z.enum(domainStatuses),note:z.string().trim().max(2000),reference:z.string().trim().max(120)}).strict();
export async function GET(req:NextRequest){
 try {
  const c=await context(req.nextUrl.searchParams.get('workspace'));
  if(!c?.workspace||!canManageDomains(c.workspace))return reply({error:'NXT administrator access required.'},403);
  const id=req.nextUrl.searchParams.get('id');
  if(id){
   if(!z.uuid().safeParse(id).success)return reply({error:'Invalid order.'},400);
   const [order,events]=await Promise.all([
    c.db.from('nxt_domain_orders').select('*').eq('id',id).maybeSingle(),
    c.db.from('nxt_domain_events').select('id,order_id,actor_label,from_status,to_status,note,registration_reference,created_at').eq('order_id',id).order('created_at',{ascending:false})
   ]);
   if(order.error||events.error)return reply({error:'Could not load this registration.'},503);
   return order.data?reply({order:order.data,events:events.data??[]}):reply({error:'Order not found.'},404);
  }
  const query=req.nextUrl.searchParams.get('q')??'',status=req.nextUrl.searchParams.get('status')??'',payment=req.nextUrl.searchParams.get('payment')??'',page=Number(req.nextUrl.searchParams.get('page')??0);
  if(query.length>100||!Number.isInteger(page)||page<0||page>10000||(!domainStatuses.includes(status as typeof domainStatuses[number])&&status!=='')||!['','unpaid','paid','refunded'].includes(payment))return reply({error:'Invalid filters.'},400);
  const {data,error}=await c.db.rpc('nxt_domain_admin_queue',{p_query:query,p_status:status,p_payment:payment,p_page:page});
  return error?reply({error:'Could not load domain registrations. Please retry.'},503):reply(data);
 }catch{return reply({error:'Domain registrations are temporarily unavailable.'},503);}
}
export async function PATCH(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Forbidden.'},403);
 try {
  const c=await context(req.nextUrl.searchParams.get('workspace'));
  if(!c?.workspace||!canManageDomains(c.workspace))return reply({error:'NXT administrator access required.'},403);
  const body=await req.text();if(body.length>12000)return reply({error:'Update is too large.'},413);
  const parsed=update.safeParse(JSON.parse(body));if(!parsed.success)return reply({error:'Check the status, note and confirmation reference.'},400);
  const v=parsed.data;
  const {data,error}=await c.db.rpc('nxt_domain_update_registration',{p_order:v.id,p_version:v.version,p_status:v.status,p_note:v.note,p_reference:v.reference});
  if(error){
   if(['22023','40001','P0002','42501'].includes(error.code))return reply({error:error.message},error.code==='40001'?409:error.code==='P0002'?404:error.code==='42501'?403:400);
   return reply({error:'Could not save the update. Please refresh before retrying.'},503);
  }
  return reply({order:data});
 }catch(e){return reply({error:e instanceof SyntaxError?'Invalid request.':'Could not save the registration update.'},e instanceof SyntaxError?400:503);}
}
