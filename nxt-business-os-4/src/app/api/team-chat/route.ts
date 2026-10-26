import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {trustedRequest} from '@/lib/request-origin';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(b:unknown,s=200)=>NextResponse.json(b,{status:s,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));
  if(!c?.workspace)return reply({error:'Sign in required'},401);
  if(c.workspace.role==='client')return reply({error:'Staff access required'},403);
  const t=c.workspace.id;
  const [messages,staff]=await Promise.all([
   c.db.from('team_chat_messages').select('*').eq('tenant_id',t).order('created_at',{ascending:false}).limit(100),
   c.db.from('staff_directory').select('user_id,name,email').eq('tenant_id',t)
  ]);
  if(messages.error||staff.error)return reply({error:'Team chat could not load'},503);
  return reply({user_id:c.user.id,messages:(messages.data??[]).reverse(),staff:staff.data??[]});
 }catch{return reply({error:'Team chat unavailable'},503);}
}
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Untrusted request'},403);
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));
  if(!c?.workspace)return reply({error:'Sign in required'},401);
  if(c.workspace.role==='client')return reply({error:'Staff access required'},403);
  const p=z.object({body:z.string().trim().min(1).max(5000)}).safeParse(await req.json().catch(()=>null));
  if(!p.success)return reply({error:'Write a message first.'},400);
  const r=await c.db.from('team_chat_messages').insert({tenant_id:c.workspace.id,author_id:c.user.id,body:p.data.body}).select().single();
  return reply(r.error?{error:r.error.message}:r.data,r.error?400:201);
 }catch{return reply({error:'Message could not be sent'},503);}
}
