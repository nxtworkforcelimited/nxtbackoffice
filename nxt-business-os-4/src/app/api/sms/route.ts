import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';

export const dynamic='force-dynamic';

const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});

export async function GET(req:NextRequest){
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));
  if(!c)return reply({error:'Please sign in.'},401);
  if(!c.workspace||c.workspace.role==='client')return reply({error:'Staff access required.'},403);
  if(!allowed(c.workspace.role,c.workspace.permissions??[],'sms'))return reply({error:'SMS access required.'},403);

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!secret)return reply({error:'SMS service status is unavailable.'},503);

  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const [settings,queue,clients]=await Promise.all([
   admin.from('sms_settings').select('enabled,base_url,sender_id,batch_size,updated_at').eq('tenant_id',c.workspace.id).maybeSingle(),
   admin.from('sms_outbox').select('status,source_type,created_at,submitted_at,delivered_at,last_error').eq('tenant_id',c.workspace.id).order('created_at',{ascending:false}).limit(100),
   admin.from('clients').select('id,contact_code,title,phone,approval_sms_enabled,archived_at').eq('tenant_id',c.workspace.id).is('archived_at',null).order('created_at')
  ]);

  if(settings.error||queue.error||clients.error)return reply({error:'SMS integration status could not load.'},503);

  const rows=queue.data??[];
  const counts={queued:0,submitted:0,delivered:0,failed:0} as Record<string,number>;
  for(const row of rows)if(row.status in counts)counts[row.status]=(counts[row.status]??0)+1;

  const clientRows=clients.data??[];
  const ready=clientRows.filter(x=>x.approval_sms_enabled&&Boolean(x.phone));
  const missing=clientRows.filter(x=>x.approval_sms_enabled&&!x.phone);

  return reply({
   provider:'Gikko / Infobip',
   enabled:Boolean(settings.data?.enabled),
   sender_id:settings.data?.sender_id??'InfoSMS',
   batch_size:settings.data?.batch_size??10,
   updated_at:settings.data?.updated_at??null,
   ready_clients:ready.length,
   enabled_without_phone:missing.length,
   total_clients:clientRows.length,
   counts,
   recent:rows.slice(0,10).map(x=>({
    status:x.status,
    source_type:x.source_type,
    created_at:x.created_at,
    delivered_at:x.delivered_at,
    error:x.last_error?String(x.last_error).slice(0,180):null
   }))
  });
 }catch{
  return reply({error:'SMS integration status is temporarily unavailable.'},503);
 }
}
