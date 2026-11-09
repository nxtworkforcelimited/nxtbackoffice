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
  const summary:any=summariseTracking(links,clicks,days);
  if(!clientId){
   // Leads: CRM opportunities whose source is one of these tracked links. Staff only.
   const d=await c.db.from('deals').select('lead_source,status').eq('tenant_id',c.workspace.id).like('lead_source','link:%').limit(5000);
   if(d.error)throw d.error;
   const by=new Map<string,{leads:number;won:number}>();
   for(const x of d.data){const k=String(x.lead_source).slice(5),r=by.get(k)||{leads:0,won:0};r.leads++;if(x.status==='won')r.won++;by.set(k,r);}
   summary.links=summary.links.map((l:any)=>({...l,leads:by.get(l.code)?.leads||0,won:by.get(l.code)?.won||0}));
   summary.leads=summary.links.reduce((n:number,l:any)=>n+l.leads,0);summary.won=summary.links.reduce((n:number,l:any)=>n+l.won,0);
  }
  return reply(summary);
 }catch(e){return reply({error:(e as Error).message||'Results could not load'},500);}
}
