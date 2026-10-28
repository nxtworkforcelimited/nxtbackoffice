import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {trustedRequest} from '@/lib/request-origin';
import {prepareFinanceMessage} from '@/lib/finance-message';
import type {SmsTemplate} from '@/lib/sms-template';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
function service(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;}
export async function GET(req:NextRequest){
 try{
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client'||!allowed(c.workspace.role,c.workspace.permissions??[],'finance'))return reply({error:'Finance access required.'},403);
 const id=z.uuid().safeParse(req.nextUrl.searchParams.get('document'));if(!id.success)return reply({error:'Choose a document.'},400);
 const admin=service();if(!admin)return reply({error:'Messaging is unavailable.'},503);
 const d=await admin.from('business_items').select('id,kind,reference,client_id,status,total,paid,currency,due_date').eq('tenant_id',c.workspace.id).eq('id',id.data).is('deleted_at',null).in('kind',['invoice','quote']).in('status',['issued','paid','accepted']).maybeSingle();
 if(d.error)throw d.error;if(!d.data?.client_id)return reply({error:'Issue this document to a client before sending.'},400);
 const [templates,payments,client]=await Promise.all([
 admin.from('sms_templates').select('*').eq('tenant_id',c.workspace.id).in('context_kind',d.data.kind==='quote'?['quotation']:['invoice','payment']).order('name'),
 admin.from('invoice_payments').select('id,amount,reference,created_at').eq('tenant_id',c.workspace.id).eq('invoice_id',d.data.id).order('created_at',{ascending:false}),
 admin.from('clients').select('title,phone,email,approval_sms_enabled,approval_email_enabled').eq('tenant_id',c.workspace.id).eq('id',d.data.client_id).is('archived_at',null).maybeSingle()]);
 if(templates.error||payments.error||client.error)throw Error();if(!client.data)return reply({error:'Client is unavailable.'},400);
 return reply({document:d.data,templates:templates.data,payments:payments.data,client:client.data});
 }catch{return reply({error:'Document message options could not load.'},503);}
}
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Open the portal directly and retry.'},403);
 try{
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client'||!allowed(c.workspace.role,c.workspace.permissions??[],'finance'))return reply({error:'Finance access required.'},403);
 const p=z.object({action:z.enum(['preview','send']),document_id:z.uuid(),template:z.string().min(1).max(100),channel:z.enum(['sms','email']),payment_id:z.uuid().nullable().optional(),request_id:z.uuid().optional(),expected_body:z.string().max(10000).optional(),expected_subject:z.string().max(300).optional(),expected_recipient:z.string().max(320).optional()}).safeParse(await req.json().catch(()=>null));
 if(!p.success)return reply({error:'Choose the document, template and delivery method.'},400);
 const v=p.data,admin=service(),tenant=c.workspace.id;if(!admin)return reply({error:'Messaging is unavailable.'},503);
 const [d,t]=await Promise.all([
 admin.from('business_items').select('id,kind,reference,client_id,status,total,paid,currency,due_date').eq('tenant_id',tenant).eq('id',v.document_id).is('deleted_at',null).in('kind',['invoice','quote']).in('status',['issued','paid','accepted']).maybeSingle(),
 admin.from('sms_templates').select('*').eq('tenant_id',tenant).eq('event',v.template).in('context_kind',['invoice','quotation','payment']).maybeSingle()]);
 if(d.error||t.error)throw Error();if(!d.data?.client_id||!t.data)return reply({error:'Document or template is unavailable.'},404);
 const client=await admin.from('clients').select('title,phone,email,approval_sms_enabled,approval_email_enabled').eq('tenant_id',tenant).eq('id',d.data.client_id).is('archived_at',null).maybeSingle();
 if(client.error)throw client.error;if(!client.data)return reply({error:'Client unavailable.'},404);
 const contact=client.data;
 const recipient=v.channel==='sms'?contact.phone:contact.email;
 if(v.channel==='sms'){
  const settings=await admin.from('sms_settings').select('enabled').eq('tenant_id',tenant).maybeSingle();if(settings.error)throw settings.error;
  if(!settings.data?.enabled)return reply({error:'Gikko delivery is disabled.'},400);
  if(!contact.approval_sms_enabled||!/^[+][1-9][0-9]{7,14}$/.test(recipient??''))return reply({error:'Enable SMS alerts and save a valid international number on this contact.'},400);
 }else if(!contact.approval_email_enabled||!z.email().safeParse(recipient).success)return reply({error:'Enable email alerts and save a valid email address on this contact.'},400);
 let payment=null;
 if(t.data.context_kind==='payment'){
  if(!v.payment_id)return reply({error:'Choose a recorded payment.'},400);
  const r=await admin.from('invoice_payments').select('id,invoice_id,amount,reference,created_at').eq('tenant_id',tenant).eq('invoice_id',d.data.id).eq('id',v.payment_id).maybeSingle();if(r.error)throw r.error;payment=r.data;
 }
 let prepared;try{prepared=prepareFinanceMessage({document:d.data,payment,name:contact.title,template:t.data as SmsTemplate,channel:v.channel});}catch(e){return reply({error:(e as Error).message},400);}
 if(v.action==='preview')return reply({...prepared,recipient,client_name:contact.title});
 if(!v.request_id||v.expected_body!==prepared.body||v.expected_subject!==prepared.subject||v.expected_recipient!==recipient)return reply({error:'The document, payment or recipient changed. Preview the message again.'},409);
 if(v.channel==='email'&&(!process.env.RESEND_API_KEY||!process.env.NOTIFICATION_FROM||!process.env.NEXT_PUBLIC_APP_URL))return reply({error:'Email delivery is not configured. The message has not been queued.'},503);
 const key=tenant+':finance-message:'+v.channel+':'+v.request_id,source=payment?.id??d.data.id;
 const saved=v.channel==='sms'?await admin.from('sms_outbox').insert({tenant_id:tenant,client_id:d.data.client_id,source_type:'manual_finance',source_id:source,approval_key:key,recipient,body:prepared.body,provider:'gikko',status:'queued'}):await admin.from('notification_outbox').insert({tenant_id:tenant,recipient,subject:prepared.subject,body:prepared.body,source_type:'client_finance',source_id:source,event_key:key});
 if(saved.error&&saved.error.code!=='23505')return reply({error:'The message could not be queued. Please retry.'},503);
 return reply({ok:true,note:(v.channel==='sms'?'SMS':'Email')+' queued for delivery.'},201);
 }catch{return reply({error:'The message could not be prepared. Please retry.'},503);}
}
