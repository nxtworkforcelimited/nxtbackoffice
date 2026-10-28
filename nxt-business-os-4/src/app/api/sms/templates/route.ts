import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {trustedRequest} from '@/lib/request-origin';
import {z} from 'zod';
const events=['welcome','invoice_sent','project_update','project_completed','ticket_received','ticket_resolved'] as const;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client'||!allowed(c.workspace.role,c.workspace.permissions??[],'sms'))return reply({error:'SMS access required.'},403);
 const r=await c.db.from('sms_templates').select('event,body,enabled').eq('tenant_id',c.workspace.id).order('event');
 return reply(r.error?{error:'SMS templates could not load.'}:{templates:r.data},r.error?503:200);
}
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Open the portal directly and retry.'},403);
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client'||!allowed(c.workspace.role,c.workspace.permissions??[],'sms'))return reply({error:'SMS access required.'},403);
 const p=z.object({event:z.enum(events),body:z.string().trim().min(1).max(480),enabled:z.boolean()}).safeParse(await req.json().catch(()=>null));
 if(!p.success)return reply({error:'Choose a template and enter up to 480 characters.'},400);
 const permitted:Record<string,string[]>={welcome:[],invoice_sent:['invoice_number'],project_update:['project_name'],project_completed:['project_name'],ticket_received:['ticket_number'],ticket_resolved:['ticket_number']};
 let body=p.data.body;for(const key of ['name','portal_link',...permitted[p.data.event]])body=body.replaceAll('{'+key+'}','');
 if(/[{}]/.test(body))return reply({error:'Use only the placeholders listed for this template.'},400);
 const r=await c.db.from('sms_templates').upsert({...p.data,tenant_id:c.workspace.id},{onConflict:'tenant_id,event'});
 return reply(r.error?{error:'Template could not be saved.'}:{ok:true},r.error?400:200);
}
