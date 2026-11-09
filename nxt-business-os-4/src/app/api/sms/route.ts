import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {trustedRequest} from '@/lib/request-origin';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {normalisePhone} from '@/lib/phone';
import {renderTemplate,unknownFields,money,dueDateText,shortReceipt,isQuietHour,type MergeValues} from '@/lib/sms-templates';

export const dynamic='force-dynamic';

const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});

export async function GET(req:NextRequest){
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));
  if(!c)return reply({error:'Please sign in.'},401);
  if(!c.workspace||c.workspace.role==='client')return reply({error:'Staff access required.'},403);
  if(!allowed(c.workspace.role,c.workspace.permissions??[],'sms'))return reply({error:'SMS access required.'},403);

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!secret)return reply({error:'SMS service status is unavailable.'},503);

  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const [settings,queue,clients,templates,invoices,payments]=await Promise.all([
   admin.from('sms_settings').select('enabled,base_url,sender_id,batch_size,updated_at').eq('tenant_id',c.workspace.id).maybeSingle(),
   admin.from('sms_outbox').select('status,source_type,created_at,submitted_at,delivered_at,last_error,recipient,body,client_id').eq('tenant_id',c.workspace.id).order('created_at',{ascending:false}).limit(100),
   admin.from('clients').select('id,contact_code,title,phone,approval_sms_enabled,archived_at').eq('tenant_id',c.workspace.id).is('archived_at',null).order('created_at'),
   admin.from('sms_templates').select('id,name,category,body,updated_at').eq('tenant_id',c.workspace.id).is('archived_at',null).order('name'),
   admin.from('business_items').select('id,reference,title,client_id,total,paid,currency,due_date,status,created_at').eq('tenant_id',c.workspace.id).eq('kind','invoice').is('deleted_at',null).neq('status','draft').order('created_at',{ascending:false}).limit(300),
   admin.from('invoice_payments').select('id,invoice_id,amount,created_at').eq('tenant_id',c.workspace.id).order('created_at',{ascending:false}).limit(1000)
  ]);

  const templatesReady=!templates.error;
  if(settings.error||queue.error||clients.error||invoices.error||payments.error)return reply({error:'SMS integration status could not load.'},503);

  const rows=queue.data??[];
  const counts={queued:0,submitted:0,delivered:0,failed:0} as Record<string,number>;
  for(const row of rows)if(row.status in counts)counts[row.status]=(counts[row.status]??0)+1;

  const clientRows=clients.data??[];
  const ready=clientRows.filter(x=>x.approval_sms_enabled&&Boolean(x.phone));
  const missing=clientRows.filter(x=>x.approval_sms_enabled&&!x.phone);

  return reply({
   provider:'Gikko / Infobip',
   enabled:Boolean(settings.data?.enabled),
   sender_id:settings.data?.sender_id??'InfoSMS',
   batch_size:settings.data?.batch_size??10,
   updated_at:settings.data?.updated_at??null,
   ready_clients:ready.length,
   enabled_without_phone:missing.length,
   total_clients:clientRows.length,
   clients:clientRows.map(x=>({id:x.id,contact_code:x.contact_code,title:x.title,phone:x.phone||''})),
   counts,
   templates:templatesReady?templates.data:[],
   templates_ready:templatesReady,
   company:c.workspace.name,
   invoices:(invoices.data??[]).map(i=>{const last=(payments.data??[]).find(p=>p.invoice_id===i.id);return {id:i.id,reference:i.reference,title:i.title,client_id:i.client_id,total:Number(i.total),paid:Number(i.paid),currency:i.currency,due_date:i.due_date,status:i.status,receipt_number:last?shortReceipt(last.id):'',last_payment:last?Number(last.amount):0};}),
   recent:rows.slice(0,15).map(x=>({
    status:x.status,
    source_type:x.source_type,
    created_at:x.created_at,
    delivered_at:x.delivered_at,
    recipient:x.recipient,
    message:String(x.body??'').slice(0,160),
    client:clientRows.find(k=>k.id===x.client_id)?.title??'',
    error:x.last_error?String(x.last_error).slice(0,180):null
   }))
  });
 }catch{
  return reply({error:'SMS integration status is temporarily unavailable.'},503);
 }
}


const sendInput=z.object({action:z.literal('send').optional(),client_id:z.uuid().nullable().optional(),invoice_id:z.uuid().nullable().optional(),template_id:z.uuid().nullable().optional(),recipient:z.string().trim().min(5).max(40),message:z.string().trim().min(1).max(480),allow_night:z.boolean().optional()});
const saveInput=z.object({action:z.literal('template_save'),id:z.uuid().optional(),name:z.string().trim().min(1).max(80),category:z.enum(['invoice','receipt','reminder','general']),body:z.string().trim().min(1).max(480)});
const archiveInput=z.object({action:z.literal('template_archive'),id:z.uuid()});
const harareDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Harare'}).format(new Date());

export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Open the back office directly and retry.'},403);
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));
  if(!c?.workspace||c.workspace.role==='client')return reply({error:'Staff access required.'},403);
  if(!allowed(c.workspace.role,c.workspace.permissions??[],'sms'))return reply({error:'SMS access required.'},403);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!secret)return reply({error:'SMS service is unavailable.'},503);
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const tenant=c.workspace.id,raw=await req.json().catch(()=>null);

  if(raw?.action==='template_save'){
   const p=saveInput.safeParse(raw);if(!p.success)return reply({error:'Give the template a name (up to 80 characters) and a message (up to 480).'},400);
   const bad=unknownFields(p.data.body);if(bad.length)return reply({error:'Unknown merge field: {'+bad[0]+'}. Pick fields from the list.'},400);
   const row={name:p.data.name,category:p.data.category,body:p.data.body,updated_at:new Date().toISOString()};
   const out=p.data.id
    ?await admin.from('sms_templates').update(row).eq('tenant_id',tenant).eq('id',p.data.id).is('archived_at',null).select('id,name,category,body').single()
    :await admin.from('sms_templates').insert({...row,tenant_id:tenant,created_by:c.user.id}).select('id,name,category,body').single();
   return out.error?reply({error:'Template could not be saved. Has the SMS templates migration been applied?'},400):reply(out.data,p.data.id?200:201);
  }
  if(raw?.action==='template_archive'){
   // Templates are archived, never deleted, so history stays intact.
   const p=archiveInput.safeParse(raw);if(!p.success)return reply({error:'Template not found.'},400);
   const out=await admin.from('sms_templates').update({archived_at:new Date().toISOString()}).eq('tenant_id',tenant).eq('id',p.data.id).select('id').single();
   return out.error?reply({error:'Template could not be archived.'},400):reply({ok:true});
  }

  const p=sendInput.safeParse(raw);
  if(!p.success)return reply({error:'Enter a valid mobile number and a message.'},400);
  const phone=normalisePhone(p.data.recipient);
  const digits=(phone.e164??p.data.recipient).replace(/[^\d]/g,'');
  if(!/^[1-9][0-9]{7,14}$/.test(digits))return reply({error:'Enter a valid international mobile number, for example +2637XXXXXXXX.'},400);
  const recipient='+'+digits;

  // Merge fields are filled on the server from the saved invoice, so the text sent always matches the records.
  const templated=Boolean(p.data.template_id||p.data.invoice_id)||/\{[a-z_]+\}/.test(p.data.message);
  let clientId=p.data.client_id??null,values:MergeValues={company:c.workspace.name};
  if(p.data.invoice_id){
   const inv=await admin.from('business_items').select('id,reference,client_id,total,paid,currency,due_date').eq('tenant_id',tenant).eq('id',p.data.invoice_id).eq('kind','invoice').is('deleted_at',null).maybeSingle();
   if(!inv.data)return reply({error:'That invoice was not found.'},404);
   if(clientId&&inv.data.client_id&&clientId!==inv.data.client_id)return reply({error:'That invoice belongs to a different client.'},400);
   clientId=clientId??inv.data.client_id??null;
   const pay=await admin.from('invoice_payments').select('id,amount').eq('tenant_id',tenant).eq('invoice_id',inv.data.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
   const bal=Math.max(0,Math.round((Number(inv.data.total)-Number(inv.data.paid))*100)/100);
   values={...values,invoice_number:inv.data.reference,amount:money(inv.data.currency,inv.data.total),balance:money(inv.data.currency,bal),paid:money(inv.data.currency,pay.data?.amount??inv.data.paid),due_date:dueDateText(inv.data.due_date),receipt_number:pay.data?shortReceipt(pay.data.id):''};
  }
  if(clientId){
   const cl=await admin.from('clients').select('title').eq('tenant_id',tenant).eq('id',clientId).maybeSingle();
   if(!cl.data)return reply({error:'That client was not found.'},404);
   values.client_name=cl.data.title;
  }
  const body=templated?renderTemplate(p.data.message,values):p.data.message;
  const left=unknownFields(body).concat([...body.matchAll(/\{([a-z_]+)\}/g)].map(m=>m[1]));
  if(left.length)return reply({error:'This message still has {'+left[0]+'} unfilled. Pick the client or invoice it needs, or remove it.'},400);
  if(body.length>480)return reply({error:'After filling in the details the message is over 480 characters. Shorten it.'},400);
  if(templated&&isQuietHour()&&!p.data.allow_night)return reply({error:'It is night in Harare (8pm to 7am). Send in the morning, or tick "Send anyway".',quiet_hours:true},409);

  // The same message to the same number is only sent once a day.
  const source=crypto.randomUUID();
  const approval=templated?'tpl:'+createHash('sha256').update([tenant,recipient,body,harareDay()].join('|')).digest('hex').slice(0,40):'manual:'+source;
  if(templated){
   const dup=await admin.from('sms_outbox').select('id').eq('tenant_id',tenant).eq('approval_key',approval).neq('status','failed').limit(1);
   if(dup.data?.length)return reply({error:'This exact message was already sent to this number today.',duplicate:true},409);
  }
  const row=await admin.from('sms_outbox').insert({
   tenant_id:tenant,client_id:clientId,source_type:templated?'template':'manual',source_id:source,
   approval_key:approval,recipient,body,provider:'gikko',status:'queued'
  }).select('id,status,recipient,created_at').single();
  return reply(row.error?{error:row.error.message}:{...row.data,message:body,note:'Queued. The SMS worker runs every minute.'},row.error?400:201);
 }catch{return reply({error:'SMS could not be queued.'},503);}
}
