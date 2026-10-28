import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {trustedRequest} from '@/lib/request-origin';
import {smsEvents,validateSmsTemplate,automaticSmsEvents,financeKinds} from '@/lib/sms-template';
import {z} from 'zod';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client'||(!allowed(c.workspace.role,c.workspace.permissions??[],'sms')&&!allowed(c.workspace.role,c.workspace.permissions??[],'finance')))return reply({error:'SMS access required.'},403);
 const r=await c.db.from('sms_templates').select('event,name,context_kind,body,enabled,email_subject,email_body').eq('tenant_id',c.workspace.id).order('name');
 return reply(r.error?{error:'SMS templates could not load.'}:{templates:r.data},r.error?503:200);
}
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Open the portal directly and retry.'},403);
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client'||(!allowed(c.workspace.role,c.workspace.permissions??[],'sms')&&!allowed(c.workspace.role,c.workspace.permissions??[],'finance')))return reply({error:'SMS access required.'},403);
 const p=z.object({event:z.string().regex(/^(welcome|invoice_sent|invoice_reminder|quote_sent|payment_received|project_update|project_completed|ticket_received|ticket_resolved|custom_[a-f0-9-]{36})$/).optional(),name:z.string().trim().min(1).max(100),context_kind:z.enum(['general','invoice','quotation','payment','project','ticket']),body:z.string().trim().min(1).max(480),enabled:z.boolean().default(false),email_subject:z.string().trim().max(300).default(''),email_body:z.string().trim().max(10000).default('')}).safeParse(await req.json().catch(()=>null));
 if(!p.success)return reply({error:'Enter a template name, message type and message.'},400);
 const event=p.data.event??'custom_'+crypto.randomUUID(),builtin=smsEvents[event];
 const kind=builtin?.kind??p.data.context_kind;
 if(!allowed(c.workspace.role,c.workspace.permissions??[],'sms')&&!financeKinds.includes(kind))return reply({error:'SMS access required for this template.'},403);
 try{validateSmsTemplate(p.data.body,kind);if(p.data.email_subject)validateSmsTemplate(p.data.email_subject,kind,300);if(p.data.email_body)validateSmsTemplate(p.data.email_body,kind,10000);if(/[\r\n]/.test(p.data.email_subject))throw Error('Email subject must be one line.');}catch(e){return reply({error:(e as Error).message},400);}
 const r=await c.db.from('sms_templates').upsert({...p.data,event,context_kind:kind,enabled:automaticSmsEvents.includes(event)?p.data.enabled:false,tenant_id:c.workspace.id},{onConflict:'tenant_id,event'});
 return reply(r.error?{error:'Template could not be saved.'}:{ok:true,event},r.error?400:200);
}
