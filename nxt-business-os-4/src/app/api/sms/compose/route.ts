import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {trustedRequest} from '@/lib/request-origin';
import {renderSmsTemplate,type SmsTemplate} from '@/lib/sms-template';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
function service(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;}
export async function GET(req:NextRequest){
 try{
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client'||!allowed(c.workspace.role,c.workspace.permissions??[],'sms'))return reply({error:'SMS access required.'},403);
 const admin=service();if(!admin)return reply({error:'SMS is temporarily unavailable.'},503);
 const tenant=c.workspace.id;
 const [templates,clients]=await Promise.all([
 c.db.from('sms_templates').select('event,name,context_kind,body,enabled').eq('tenant_id',tenant).in('context_kind',['general','invoice','project','ticket']).order('name'),
 admin.from('clients').select('id,title,phone,approval_sms_enabled').eq('tenant_id',tenant).is('archived_at',null).order('title')]);
 if(templates.error||clients.error)return reply({error:'Message options could not load.'},503);
 let records:{id:string;label:string}[]=[];
 const event=req.nextUrl.searchParams.get('template');
 const client=z.uuid().safeParse(req.nextUrl.searchParams.get('client')),kind=req.nextUrl.searchParams.get('kind');
 if(client.success&&kind){
  const contact=clients.data?.find(x=>x.id===client.data);if(!contact)return reply({error:'Client not found.'},404);
  if(kind==='invoice'){
   const r=await admin.from('business_items').select('id,reference,title').eq('tenant_id',tenant).eq('client_id',client.data).eq('kind','invoice').in('status',['issued','paid']).is('deleted_at',null).order('created_at',{ascending:false}).limit(100);
   if(r.error)throw r.error;records=(r.data??[]).map(r=>({id:r.id,label:r.reference+' · '+r.title}));
  }else if(kind==='project'){
   const r=await admin.from('projects').select('id,title').eq('tenant_id',tenant).eq('client_id',client.data).eq('client_visible',true).in('status',event==='project_completed'?['completed']:['approved','completed']).is('archived_at',null).order('updated_at',{ascending:false}).limit(100);
   if(r.error)throw r.error;records=(r.data??[]).map(r=>({id:r.id,label:r.title}));
  }else if(kind==='ticket'){
   const m=await admin.from('memberships').select('user_id').eq('tenant_id',tenant).eq('client_id',client.data).eq('role','client');if(m.error)throw m.error;
   const ids=(m.data??[]).map(x=>x.user_id);
   if(ids.length){const r=await admin.from('it_tickets').select('id,reference,title').eq('tenant_id',tenant).in('requester_id',ids).in('status',event==='ticket_resolved'?['Resolved','Closed']:['New','Assigned','In progress','Waiting','Resolved','Closed']).order('created_at',{ascending:false}).limit(100);if(r.error)throw r.error;records=(r.data??[]).map(r=>({id:r.id,label:r.reference+' · '+r.title}));}
  }
 }
 return reply({templates:templates.data,clients:clients.data,records});
 }catch{return reply({error:'Message options could not load. Please retry.'},503);}
}
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Open the portal directly and retry.'},403);
 try{
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client'||!allowed(c.workspace.role,c.workspace.permissions??[],'sms'))return reply({error:'SMS access required.'},403);
 const p=z.object({action:z.enum(['preview','send']),template:z.string().min(1).max(100),client_id:z.uuid(),record_id:z.uuid().nullable().optional(),request_id:z.uuid().optional(),body_override:z.string().trim().min(1).max(480).optional(),expected_body:z.string().max(1600).optional(),expected_recipient:z.string().max(20).optional()}).safeParse(await req.json().catch(()=>null));
 if(!p.success)return reply({error:'Choose a template and client.'},400);
 const v=p.data,tenant=c.workspace.id,admin=service();if(!admin)return reply({error:'SMS is temporarily unavailable.'},503);
 const [template,client,settings]=await Promise.all([
 c.db.from('sms_templates').select('event,name,context_kind,body,enabled').eq('tenant_id',tenant).eq('event',v.template).maybeSingle(),
 admin.from('clients').select('id,title,phone,approval_sms_enabled').eq('tenant_id',tenant).eq('id',v.client_id).is('archived_at',null).maybeSingle(),
 admin.from('sms_settings').select('enabled').eq('tenant_id',tenant).maybeSingle()]);
 if(template.error||client.error||settings.error)return reply({error:'The message could not be prepared.'},503);
 if((!template.data&&v.template!=='manual_message')||!client.data)return reply({error:'Template or client not found.'},404);
 const contact=client.data,t=(v.template==='manual_message'?{event:'manual_message',context_kind:'general',name:'Custom message',body:v.body_override??'',enabled:false}:{...template.data,body:v.body_override??template.data?.body}) as SmsTemplate;
 if(!['general','invoice','project','ticket'].includes(t.context_kind))return reply({error:'Open this template from the invoice or quotation messaging actions.'},400);
 if(!settings.data?.enabled)return reply({error:'Gikko delivery is disabled.'},400);
 if(!contact.approval_sms_enabled)return reply({error:'Enable SMS alerts on this contact before sending.'},400);
 if(!/^[+][1-9][0-9]{7,14}$/.test(contact.phone??''))return reply({error:'This client needs a valid international mobile number.'},400);
 const values:Record<string,string>={name:contact.title,portal_link:'https://os.nxt-workforce.com/login'};
 let recordId=v.record_id??null,recordLabel='';
 if(t.context_kind==='invoice'){
  let q=admin.from('business_items').select('id,reference,total,paid,currency,due_date').eq('tenant_id',tenant).eq('client_id',contact.id).eq('kind','invoice').in('status',['issued','paid']).is('deleted_at',null);
  if(recordId)q=q.eq('id',recordId);
  const r=await q.order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(r.error)throw r.error;if(!r.data)return reply({error:'No issued invoice found for this client.'},400);
  recordId=r.data.id;recordLabel=r.data.reference;values.invoice_number=r.data.reference;values.invoice_total=r.data.currency+' '+Number(r.data.total).toFixed(2);values.balance=r.data.currency+' '+Math.max(0,Number(r.data.total)-Number(r.data.paid)).toFixed(2);values.due_date=r.data.due_date??'Not specified';if(t.event==='invoice_reminder'&&Number(r.data.total)<=Number(r.data.paid))return reply({error:'This invoice is fully paid. A reminder cannot be sent.'},400);
 }else if(t.context_kind==='project'){
  let q=admin.from('projects').select('id,title,status').eq('tenant_id',tenant).eq('client_id',contact.id).eq('client_visible',true).in('status',t.event==='project_completed'?['completed']:['approved','completed']).is('archived_at',null);if(recordId)q=q.eq('id',recordId);
  const r=await q.order('updated_at',{ascending:false}).limit(1).maybeSingle();if(r.error)throw r.error;if(!r.data)return reply({error:'No matching published project found for this client.'},400);
  recordId=r.data.id;recordLabel=r.data.title;values.project_name=r.data.title;
 }else if(t.context_kind==='ticket'){
  const m=await admin.from('memberships').select('user_id').eq('tenant_id',tenant).eq('client_id',contact.id).eq('role','client');if(m.error)throw m.error;const ids=(m.data??[]).map(x=>x.user_id);
  if(!ids.length)return reply({error:'No client tickets found.'},400);
  let q=admin.from('it_tickets').select('id,reference').eq('tenant_id',tenant).in('requester_id',ids);if(recordId)q=q.eq('id',recordId);if(t.event==='ticket_resolved')q=q.in('status',['Resolved','Closed']);
  const r=await q.order('created_at',{ascending:false}).limit(1).maybeSingle();if(r.error)throw r.error;if(!r.data)return reply({error:'No matching ticket found for this client.'},400);
  recordId=r.data.id;recordLabel=r.data.reference;values.ticket_number=r.data.reference;
 }
 let body:string;try{body=renderSmsTemplate(t,values);}catch(e){return reply({error:(e as Error).message},400);}
 const prepared={body,recipient:contact.phone,client_name:contact.title,record_id:recordId,record_label:recordLabel};
 if(v.action==='preview'){
  const previous=recordId&&t.context_kind==='invoice'?await admin.from('sms_outbox').select('id').eq('tenant_id',tenant).eq('client_id',contact.id).eq('source_id',recordId).eq('source_type','invoice_sent').in('status',['queued','submitted','delivered']).limit(1):null;
  return reply({...prepared,already_notified:Boolean(previous?.data?.length)});
 }
 if(!v.request_id||v.expected_body!==body||v.expected_recipient!==contact.phone)return reply({error:'The message or recipient changed. Preview it again before sending.'},409);
 const key=tenant+':manual-template:'+v.request_id;
 const queued=await admin.from('sms_outbox').upsert({tenant_id:tenant,client_id:contact.id,source_type:'manual_template',source_id:recordId??contact.id,approval_key:key,recipient:contact.phone,body,provider:'gikko',status:'queued'},{onConflict:'approval_key',ignoreDuplicates:true});
 if(queued.error)return reply({error:'The message could not be queued. Please retry.'},503);
 return reply({ok:true,note:'SMS queued for Gikko delivery.'},201);
 }catch{return reply({error:'The message could not be prepared. Please retry.'},503);}
}
