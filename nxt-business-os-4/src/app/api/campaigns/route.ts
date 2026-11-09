import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {context} from '@/lib/context';
import {trustedRequest} from '@/lib/request-origin';
import {summariseTracking} from '@/lib/tracking-stats';
import {loadTracking} from '@/lib/server/tracking-data';
export const dynamic='force-dynamic';
const reply=(b:unknown,s=200)=>NextResponse.json(b,{status:s,headers:{'Cache-Control':'private, no-store'}});
const slug=(v:string)=>v.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const date=z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/),z.literal('')]).transform(v=>v||null);
const fields={
 name:z.string().trim().min(1).max(160),objective:z.string().max(2000).default(''),channel:z.string().max(100).default(''),
 status:z.enum(['planned','active','paused','completed']).default('planned'),start_date:date.default(''),end_date:date.default(''),
 budget:z.coerce.number().min(0).max(1e11).default(0),currency:z.string().length(3).default('USD'),
 target_leads:z.union([z.coerce.number().int().min(0).max(1e7),z.literal(''),z.null()]).transform(v=>v===''||v===null?null:Number(v)).default(null),
 utm_campaign:z.string().max(160).default(''),call_campaign:z.string().max(160).default(''),
 client_summary:z.string().max(2000).default(''),internal_notes:z.string().max(5000).default(''),client_visible:z.boolean().default(false)
};
const createSchema=z.object({action:z.literal('create'),client_id:z.uuid(),...fields});
const updateSchema=z.object({action:z.literal('update'),id:z.uuid(),...fields});
const archiveSchema=z.object({action:z.literal('archive'),id:z.uuid(),archived:z.boolean().default(true)});

export async function GET(req:NextRequest){
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace)return reply({error:'Sign in required'},401);
  const t=c.workspace.id,days=90;
  if(c.workspace.role==='client'){
   const clientId=c.workspace.client_id;if(!clientId)return reply({error:'Client account is not linked to a client record.'},400);
   const list=await c.db.rpc('client_visible_campaigns',{t});if(list.error)throw list.error;
   const {links,clicks}=await loadTracking(c,t,{clientId,days});
   const campaigns=(list.data??[]).map((x:any)=>({...x,results:resultsFor(x.utm_campaign,clientId,links,clicks,days)}));
   return reply({role:'client',campaigns});
  }
  const showArchived=req.nextUrl.searchParams.get('archived')==='1';
  let q=c.db.from('client_campaigns').select('*').eq('tenant_id',t).order('created_at',{ascending:false}).limit(500);
  if(!showArchived)q=q.is('archived_at',null);
  const [camps,clients]=await Promise.all([q,c.db.from('clients').select('id,title').eq('tenant_id',t).is('archived_at',null).order('title')]);
  if(camps.error)throw camps.error;if(clients.error)throw clients.error;
  const {links,clicks}=await loadTracking(c,t,{days});
  const callNames=[...new Set((camps.data??[]).map((x:any)=>x.call_campaign).filter(Boolean))];
  const calling:Record<string,{prospects:number;calls:number;interested:number;converted:number}>={};
  if(callNames.length){
   const pr=await c.db.from('cold_call_prospects').select('id,client_id,campaign,status').eq('tenant_id',t).eq('target_type','client').limit(5000);if(pr.error)throw pr.error;
   const ids=pr.data.filter((p:any)=>callNames.includes(p.campaign)).map((p:any)=>p.id);
   const acts=ids.length?await c.db.from('cold_call_activities').select('prospect_id,outcome').eq('tenant_id',t).in('prospect_id',ids.slice(0,1000)).limit(10000):{data:[],error:null};if(acts.error)throw acts.error;
   for(const camp of camps.data??[]){if(!camp.call_campaign)continue;
    const mine=pr.data.filter((p:any)=>p.client_id===camp.client_id&&p.campaign===camp.call_campaign),mineIds=new Set(mine.map((p:any)=>p.id)),a=acts.data.filter((x:any)=>mineIds.has(x.prospect_id));
    calling[camp.id]={prospects:mine.length,calls:a.length,interested:mine.filter((p:any)=>p.status==='interested').length,converted:mine.filter((p:any)=>p.status==='converted').length};
   }
  }
  const campaigns=(camps.data??[]).map((x:any)=>({...x,results:resultsFor(x.utm_campaign,x.client_id,links,clicks,days),calling:calling[x.id]||null}));
  return reply({role:'staff',campaigns,clients:clients.data});
 }catch(e){return reply({error:(e as Error).message||'Campaigns could not load'},500);}
}
function resultsFor(utm:string,clientId:string,links:any[],clicks:any[],days:number){
 const key=slug(utm||'');if(!key)return {linked:false,links:0,clicks:0,unique:0};
 const mine=links.filter(l=>l.client_id===clientId&&slug(l.campaign)===key);
 const s=summariseTracking(mine,clicks,days);
 return {linked:true,links:mine.length,clicks:s.clicks,unique:s.unique};
}

export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Forbidden'},403);
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace)return reply({error:'Sign in required'},401);
  if(c.workspace.role==='client')return reply({error:'Staff access required'},403);
  const t=c.workspace.id,body=await req.json().catch(()=>null),action=String(body?.action||'');
  if(action==='create'){
   const p=createSchema.parse(body);
   const chk=await c.db.from('clients').select('id').eq('tenant_id',t).eq('id',p.client_id).maybeSingle();if(chk.error||!chk.data)return reply({error:'Choose a valid client.'},400);
   const {action:_a,...rest}=p;
   const r=await c.db.from('client_campaigns').insert({...rest,utm_campaign:slug(rest.utm_campaign||rest.name),tenant_id:t}).select('*').single();if(r.error)throw r.error;
   return reply(r.data,201);
  }
  if(action==='update'){
   const {action:_a,id,...rest}=updateSchema.parse(body);
   const r=await c.db.from('client_campaigns').update({...rest,utm_campaign:slug(rest.utm_campaign||rest.name)}).eq('tenant_id',t).eq('id',id).select('*').single();if(r.error)throw r.error;
   return reply(r.data);
  }
  if(action==='archive'){
   const p=archiveSchema.parse(body);
   const r=await c.db.from('client_campaigns').update({archived_at:p.archived?new Date().toISOString():null}).eq('tenant_id',t).eq('id',p.id).select('*').single();if(r.error)throw r.error;
   return reply(r.data);
  }
  return reply({error:'Unknown action'},400);
 }catch(e){return reply({error:e instanceof z.ZodError?e.issues.map(i=>i.message).join('; '):(e as Error).message||'Campaign could not be saved'},400);}
}
