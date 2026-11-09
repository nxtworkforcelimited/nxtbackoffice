import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {context} from '@/lib/context';
import {trustedRequest} from '@/lib/request-origin';
import {categoriesFor,cleanServices} from '@/lib/client-support';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});

// Only the columns a client is meant to see. Assignee, time logged, deadlines and internal notes never leave the server.
const ticketColumns='id,reference,title,description,category,priority,status,resolution,created_at,updated_at,resolved_at';

export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c)return reply({error:'Please sign in.'},401);
 if(!c.workspace||c.workspace.role!=='client'||!c.workspace.client_id)return reply({error:'Client access required.'},403);
 const tenant=c.workspace.id,clientId=c.workspace.client_id;
 const client=await c.db.from('clients').select('id,title,services').eq('tenant_id',tenant).eq('id',clientId).maybeSingle();
 // Before the upgrade the column does not exist: support is simply off.
 if(client.error||!client.data)return reply({enabled:false,categories:[],tickets:[],comments:[]});
 const services=cleanServices(client.data.services),categories=categoriesFor(services);
 if(!categories.length)return reply({enabled:false,categories:[],tickets:[],comments:[]});
 const tickets=await c.db.from('it_tickets').select(ticketColumns).eq('tenant_id',tenant).eq('client_id',clientId).order('created_at',{ascending:false}).limit(100);
 if(tickets.error)return reply({error:'Tickets could not load.'},503);
 const ids=(tickets.data??[]).map(t=>t.id as string);
 const comments=ids.length?await c.db.from('it_ticket_comments').select('id,ticket_id,author_id,body,created_at').eq('tenant_id',tenant).eq('internal',false).in('ticket_id',ids).order('created_at'):{data:[],error:null};
 if(comments.error)return reply({error:'Replies could not load.'},503);
 // Label authors: you, a colleague at your company, or NXT. Staff names are not shown to clients.
 const authors=[...new Set((comments.data??[]).map(x=>x.author_id as string))],clientAuthors=new Set<string>();
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(authors.length&&url&&key){
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const m=await admin.from('memberships').select('user_id').eq('tenant_id',tenant).eq('role','client').eq('client_id',clientId).in('user_id',authors);
  for(const r of m.data??[])clientAuthors.add(r.user_id as string);
 }
 return reply({
  enabled:true,company:client.data.title,categories,
  tickets:tickets.data??[],
  comments:(comments.data??[]).map(x=>({id:x.id,ticket_id:x.ticket_id,body:x.body,created_at:x.created_at,from:x.author_id===c.user.id?'You':clientAuthors.has(x.author_id as string)?'Your colleague':'NXT Workforce'}))
 });
}

const createInput=z.object({action:z.literal('create'),title:z.string().trim().min(1).max(160),description:z.string().trim().min(1).max(5000),category:z.string().trim().min(1).max(60),priority:z.enum(['Low','Normal','High'])}).strict();
const commentInput=z.object({action:z.literal('comment'),ticket_id:z.uuid(),body:z.string().trim().min(1).max(5000)}).strict();

export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Open the portal directly and retry.'},403);
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c)return reply({error:'Please sign in.'},401);
 if(!c.workspace||c.workspace.role!=='client')return reply({error:'Client access required.'},403);
 const raw=await req.json().catch(()=>null);
 // The database functions re-check everything; these messages are the ones clients are allowed to see.
 const friendly=(m:string)=>/not switched on|category|urgent|title|Describe|several tickets|many open|Write a reply|resolved|not found|Too many/i.test(m)?m:'Your request could not be saved. Please try again or contact NXT Workforce.';
 if(raw?.action==='comment'){
  const p=commentInput.safeParse(raw);if(!p.success)return reply({error:'Write a reply of up to 5000 characters.'},400);
  const out=await c.db.rpc('add_client_ticket_comment',{t:c.workspace.id,p_ticket:p.data.ticket_id,p_body:p.data.body});
  return out.error?reply({error:friendly(out.error.message)},400):reply({ok:true},201);
 }
 const p=createInput.safeParse(raw);
 if(!p.success)return reply({error:'Give the ticket a title, describe the problem and choose a category.'},400);
 const out=await c.db.rpc('create_client_ticket',{t:c.workspace.id,p_title:p.data.title,p_description:p.data.description,p_category:p.data.category,p_priority:p.data.priority});
 if(out.error)return reply({error:friendly(out.error.message)},400);
 const row=Array.isArray(out.data)?out.data[0]:out.data;
 return reply({ok:true,reference:row?.reference??''},201);
}
