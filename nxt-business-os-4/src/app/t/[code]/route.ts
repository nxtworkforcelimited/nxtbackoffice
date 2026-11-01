import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {supabase} from '@/lib/supabase/server';
import {createHash} from 'node:crypto';

export const dynamic='force-dynamic';
export const runtime='nodejs';

function device(ua:string){
  if(/bot|crawler|spider|slurp|bingpreview/i.test(ua))return 'Bot';
  if(/ipad|tablet|kindle|silk/i.test(ua))return 'Tablet';
  if(/mobi|android|iphone|ipod/i.test(ua))return 'Mobile';
  return ua?'Desktop':'Unknown';
}
function safeRedirect(value:string){
  try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u:null;}catch{return null;}
}

export async function GET(req:NextRequest,{params}:{params:Promise<{code:string}>}){
  const {code}=await params;
  const fallback=new URL('/',req.url);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.redirect(fallback,307);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const campaign=await admin.from('tracking_campaigns').select('id,tenant_id,client_id,destination_url,active').eq('code',code).maybeSingle();
  const destination=campaign.data?.destination_url?safeRedirect(campaign.data.destination_url):null;
  if(campaign.error||!campaign.data||!campaign.data.active||!destination)return NextResponse.redirect(fallback,307);

  let visitorUserId:string|null=null,visitorLabel='Anonymous';
  try{
    const userDb=await supabase();
    const {data:{user}}=await userDb.auth.getUser();
    if(user){
      visitorUserId=user.id;
      const [staff,member]=await Promise.all([
        admin.from('staff_directory').select('name,email').eq('tenant_id',campaign.data.tenant_id).eq('user_id',user.id).maybeSingle(),
        admin.from('memberships').select('role,client_id').eq('tenant_id',campaign.data.tenant_id).eq('user_id',user.id).maybeSingle()
      ]);
      visitorLabel=staff.data?.name||staff.data?.email||(member.data?.role==='client'?'Logged-in client':'Logged-in user');
    }
  }catch{}

  const ua=(req.headers.get('user-agent')||'').slice(0,2000);
  const ref=(req.headers.get('referer')||'').slice(0,2000);
  const ip=(req.headers.get('x-forwarded-for')||'').split(',')[0].trim();
  const hash=ip?createHash('sha256').update(code+'|'+ip).digest('hex'):'';
  await admin.from('tracking_clicks').insert({
    campaign_id:campaign.data.id,
    tenant_id:campaign.data.tenant_id,
    client_id:campaign.data.client_id,
    visitor_user_id:visitorUserId,
    visitor_label:visitorLabel,
    referrer:ref,
    user_agent:ua,
    device:device(ua),
    visitor_hash:hash
  });

  return NextResponse.redirect(destination,307);
}
