import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {trustedRequest} from '@/lib/request-origin';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role!=='client'||!c.workspace.client_id)return reply({error:'Client access required.'},403);
 const [tickets,comments,projects]=await Promise.all([
 c.db.from('it_tickets').select('id,reference,title,description,status,priority,resolution,created_at,updated_at,due_date,project_id').eq('tenant_id',c.workspace.id).eq('requester_id',c.user.id).order('created_at',{ascending:false}),
 c.db.from('it_ticket_comments').select('id,ticket_id,body,created_at').eq('tenant_id',c.workspace.id).eq('internal',false).order('created_at'),
 c.db.from('projects').select('id,title').eq('tenant_id',c.workspace.id).eq('client_id',c.workspace.client_id).eq('client_visible',true).is('archived_at',null)]);
 if(tickets.error||comments.error||projects.error)return reply({error:'Support requests could not load.'},503);
 return reply({tickets:tickets.data,comments:comments.data,projects:projects.data});
}
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Open the portal directly and retry.'},403);
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role!=='client'||!c.workspace.client_id)return reply({error:'Client access required.'},403);
 const p=z.discriminatedUnion('action',[
 z.object({action:z.literal('ticket'),title:z.string().trim().min(1).max(160),description:z.string().trim().min(1).max(5000),priority:z.enum(['Low','Normal','High','Urgent']),project_id:z.uuid().nullable(),due_date:z.iso.date().nullable()}),
 z.object({action:z.literal('comment'),ticket_id:z.uuid(),body:z.string().trim().min(1).max(5000)})]).safeParse(await req.json().catch(()=>null));
 if(!p.success)return reply({error:'Complete the request details.'},400);
 const v=p.data;
 if(v.action==='ticket'){
  if(v.project_id){const project=await c.db.from('projects').select('id').eq('id',v.project_id).eq('tenant_id',c.workspace.id).eq('client_id',c.workspace.client_id).eq('client_visible',true).is('archived_at',null).maybeSingle();if(!project.data)return reply({error:'Choose one of your shared projects.'},400);}
  const {action,...fields}=v;
  const r=await c.db.from('it_tickets').insert({...fields,tenant_id:c.workspace.id,requester_id:c.user.id,category:'Projects / Tasks',device:''}).select('id,reference').single();
  return reply(r.error?{error:'The ticket could not be saved. Please retry.'}:r.data,r.error?400:201);
 }
 const ticket=await c.db.from('it_tickets').select('id').eq('id',v.ticket_id).eq('tenant_id',c.workspace.id).eq('requester_id',c.user.id).maybeSingle();
 if(!ticket.data)return reply({error:'Ticket not found.'},404);
 const r=await c.db.from('it_ticket_comments').insert({tenant_id:c.workspace.id,ticket_id:v.ticket_id,author_id:c.user.id,body:v.body,internal:false});
 return reply(r.error?{error:'Your reply could not be saved.'}:{ok:true},r.error?400:201);
}
