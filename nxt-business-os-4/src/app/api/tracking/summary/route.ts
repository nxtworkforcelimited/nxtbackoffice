import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {summariseTracking} from '@/lib/tracking-stats';
import {loadTracking} from '@/lib/server/tracking-data';
export const dynamic='force-dynamic';
const reply=(b:unknown,s=200)=>NextResponse.json(b,{status:s,headers:{'Cache-Control':'private, no-store'}});
// Results for tracked links: clicks over time, unique visitors, devices, sources.
// Staff see the whole workspace; a client login only sees its own client's links.
export async function GET(req:NextRequest){
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace)return reply({error:'Sign in required'},401);
  const days=[7,30,90].includes(Number(req.nextUrl.searchParams.get('days')))?Number(req.nextUrl.searchParams.get('days')):30;
  const clientId=c.workspace.role==='client'?c.workspace.client_id:null;
  if(c.workspace.role==='client'&&!clientId)return reply({error:'Client account is not linked to a client record.'},400);
  const {links,clicks}=await loadTracking(c,c.workspace.id,{clientId,days});
  return reply(summariseTracking(links,clicks,days));
 }catch(e){return reply({error:(e as Error).message||'Results could not load'},500);}
}
