import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {z} from 'zod';
export const dynamic='force-dynamic';
const id=z.uuid();
const outcomes=['no_answer','voicemail','connected','callback','interested','not_interested','wrong_number','converted'] as const;
const statuses=['new','attempted','connected','callback','interested','not_interested','wrong_number','converted'] as const;
const reply=(b:any,s=200)=>NextResponse.json(b,{status:s,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client')return reply({error:'Staff access required'},403);
  const t=c.workspace.id,date=req.nextUrl.searchParams.get('date')||new Date().toISOString().slice(0,10),offset=Number(req.nextUrl.searchParams.get('offset')||0);
  const start=new Date(date+'T00:00:00.000Z');start.setUTCMinutes(start.getUTCMinutes()-offset);
  const end=new Date(start);end.setUTCDate(end.getUTCDate()+1);
  const [prospects,activities,clients,staff]=await Promise.all([
   c.db.from('cold_call_prospects').select('*').eq('tenant_id',t).order('updated_at',{ascending:false}).limit(1000),
   c.db.from('cold_call_activities').select('*').eq('tenant_id',t).gte('called_at',start.toISOString()).lt('called_at',end.toISOString()).order('called_at',{ascending:false}).limit(2000),
   c.db.from('clients').select('id,title').eq('tenant_id',t).is('archived_at',null).order('title'),
   c.db.from('staff_directory').select('user_id,name,email').eq('tenant_id',t).order('name')
  ]);
  for(const r of [prospects,activities,clients,staff])if(r.error)throw r.error;
  return reply({user_id:c.user.id,date,prospects:prospects.data,activities:activities.data,clients:clients.data,staff:staff.data});
 }catch(e){return reply({error:(e as Error).message||'Cold calling could not load'},500);}
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'Forbidden'},403);
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client')return reply({error:'Staff access required'},403);
  const t=c.workspace.id,b=await req.json(),action=String(b.action||'');
  if(action==='create_prospect'){
   const p=z.object({target_type:z.enum(['nxt','client']),client_id:id.nullable().optional(),campaign:z.string().max(160).default(''),company:z.string().trim().min(1).max(200),contact_name:z.string().max(160).default(''),phone:z.string().trim().min(6).max(40),email:z.union([z.email(),z.literal('')]).default(''),source:z.string().max(160).default(''),owner_id:id.nullable().optional(),notes:z.string().max(5000).default('')}).parse(b);
   if(p.target_type==='client'&&!p.client_id)return reply({error:'Choose the client this calling campaign belongs to.'},400);
   const r=await c.db.from('cold_call_prospects').insert({...p,tenant_id:t,client_id:p.target_type==='client'?p.client_id:null,owner_id:p.owner_id??c.user.id}).select().single();if(r.error)throw r.error;return reply(r.data,201);
  }
  if(action==='update_prospect'){
   const p=z.object({id,status:z.enum(statuses),notes:z.string().max(5000).default(''),feedback:z.string().max(5000).default(''),next_follow_up:z.string().datetime({offset:true}).nullable().optional(),owner_id:id.nullable().optional()}).parse(b);
   const r=await c.db.from('cold_call_prospects').update({status:p.status,notes:p.notes,feedback:p.feedback,next_follow_up:p.next_follow_up??null,owner_id:p.owner_id??null}).eq('tenant_id',t).eq('id',p.id).select().single();if(r.error)throw r.error;return reply(r.data);
  }
  if(action==='log_call'){
   const p=z.object({prospect_id:id,outcome:z.enum(outcomes),notes:z.string().max(5000).default(''),feedback:z.string().max(5000).default(''),duration_seconds:z.number().int().min(0).max(28800).nullable().optional(),next_follow_up:z.string().datetime({offset:true}).nullable().optional()}).parse(b);
   const prospect=await c.db.from('cold_call_prospects').select('id').eq('tenant_id',t).eq('id',p.prospect_id).single();if(prospect.error)return reply({error:'Prospect not found'},404);
   const act=await c.db.from('cold_call_activities').insert({tenant_id:t,prospect_id:p.prospect_id,caller_id:c.user.id,outcome:p.outcome,notes:p.notes,feedback:p.feedback,duration_seconds:p.duration_seconds??null}).select().single();if(act.error)throw act.error;
   const mapped=p.outcome==='no_answer'||p.outcome==='voicemail'?'attempted':p.outcome;
   const upd=await c.db.from('cold_call_prospects').update({status:mapped,last_called_at:new Date().toISOString(),last_outcome:p.outcome,feedback:p.feedback||undefined,next_follow_up:p.next_follow_up??null}).eq('tenant_id',t).eq('id',p.prospect_id).select().single();if(upd.error)throw upd.error;
   return reply({activity:act.data,prospect:upd.data},201);
  }
  return reply({error:'Unknown action'},400);
 }catch(e){return reply({error:e instanceof z.ZodError?e.issues.map(i=>i.message).join('; '):(e as Error).message||'Cold calling action failed'},400);}
}
