import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {trustedRequest} from '@/lib/request-origin';
import {z} from 'zod';

export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const createSchema=z.object({
  destination_url:z.string().url().max(4000),
  source:z.string().trim().min(1).max(100),
  medium:z.string().trim().min(1).max(100),
  campaign:z.string().trim().min(1).max(160),
  content:z.string().trim().max(100).default(''),
  client_id:z.uuid().nullable().optional()
}).strict();

function code(){return crypto.randomUUID().replaceAll('-','').slice(0,12);}

export async function GET(req:NextRequest){
  try{
    const c=await context(req.nextUrl.searchParams.get('workspace'));
    if(!c?.workspace)return reply({error:'Sign in required'},401);
    const t=c.workspace.id, clientOnly=c.workspace.role==='client'?c.workspace.client_id:null;
    let cq=c.db.from('tracking_campaigns').select('id,client_id,code,destination_url,source,medium,campaign,content,active,created_at').eq('tenant_id',t).order('created_at',{ascending:false}).limit(200);
    let xq=c.db.from('tracking_clicks').select('id,campaign_id,client_id,visitor_user_id,visitor_label,referrer,user_agent,device,clicked_at').eq('tenant_id',t).order('clicked_at',{ascending:false}).limit(500);
    if(clientOnly){cq=cq.eq('client_id',clientOnly);xq=xq.eq('client_id',clientOnly);}
    const [campaigns,clicks,clients]=await Promise.all([
      cq,xq,c.db.from('clients').select('id,title').eq('tenant_id',t).is('archived_at',null).order('title')
    ]);
    if(campaigns.error)throw campaigns.error;if(clicks.error)throw clicks.error;if(clients.error)throw clients.error;
    const base=req.nextUrl.origin;
    return reply({
      campaigns:(campaigns.data??[]).map(x=>({...x,tracking_url:base+'/t/'+x.code})),
      clicks:clicks.data??[],
      clients:clients.data??[]
    });
  }catch(e){return reply({error:(e as Error).message||'Tracking data could not load'},500);}
}

export async function POST(req:NextRequest){
  if(!trustedRequest(req))return reply({error:'Forbidden'},403);
  try{
    const c=await context(req.nextUrl.searchParams.get('workspace'));
    if(!c?.workspace)return reply({error:'Sign in required'},401);
    const raw=createSchema.safeParse(await req.json().catch(()=>null));
    if(!raw.success)return reply({error:raw.error.issues.map(i=>i.message).join('; ')},400);
    const p=raw.data;
    const clientId=c.workspace.role==='client'?c.workspace.client_id:(p.client_id??null);
    if(c.workspace.role==='client'&&!clientId)return reply({error:'Client account is not linked to a client record.'},400);
    if(clientId){
      const chk=await c.db.from('clients').select('id').eq('tenant_id',c.workspace.id).eq('id',clientId).maybeSingle();
      if(chk.error||!chk.data)return reply({error:'Choose a valid client.'},400);
    }
    let created:any=null;
    for(let i=0;i<3;i++){
      const r=await c.db.from('tracking_campaigns').insert({
        tenant_id:c.workspace.id,client_id:clientId,code:code(),
        destination_url:p.destination_url,source:p.source,medium:p.medium,campaign:p.campaign,content:p.content,
        created_by:c.user.id
      }).select('id,client_id,code,destination_url,source,medium,campaign,content,active,created_at').single();
      if(!r.error){created=r.data;break;}
      if(r.error.code!=='23505')throw r.error;
    }
    if(!created)throw Error('Could not create a unique tracking link. Please retry.');
    return reply({...created,tracking_url:req.nextUrl.origin+'/t/'+created.code},201);
  }catch(e){return reply({error:(e as Error).message||'Tracking link could not be created'},500);}
}
