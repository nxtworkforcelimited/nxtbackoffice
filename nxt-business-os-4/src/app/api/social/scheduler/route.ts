import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {z} from 'zod';
export const dynamic='force-dynamic';
const id=z.uuid();
function allowedContent(role:string,permissions:string[]){return allowed(role,permissions,'content')||allowed(role,permissions,'approve_content');}
export async function GET(req:NextRequest){
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client'||!allowedContent(c.workspace.role,c.workspace.permissions??[]))return NextResponse.json({error:'Content access required'},{status:403});
  const t=c.workspace.id,admin=supabaseAdmin();
  const [campaigns,accounts,jobs,posts]=await Promise.all([
   admin.from('social_campaigns').select('id,client_id,title,status,created_at').eq('tenant_id',t).order('created_at',{ascending:false}),
   admin.from('social_accounts').select('id,client_id,provider,account_name,external_account_id,status,token_expires_at,scopes,created_at').eq('tenant_id',t).order('created_at'),
   admin.from('social_publish_jobs').select('id,post_id,account_id,provider,scheduled_at,status,attempts,last_error,provider_post_id,provider_url,published_at,created_at').eq('tenant_id',t).order('scheduled_at',{ascending:false}).limit(250),
   admin.from('social_posts').select('id,title,description,status,client_id,channel,campaign_id,platform_copy,due_date').eq('tenant_id',t).order('created_at',{ascending:false}).limit(500)
  ]);
  for(const r of [campaigns,accounts,jobs,posts])if(r.error)throw r.error;
  return NextResponse.json({campaigns:campaigns.data,accounts:accounts.data,jobs:jobs.data,posts:posts.data,providers:[
   {provider:'facebook',label:'Facebook',configured:Boolean(process.env.META_APP_ID&&process.env.META_APP_SECRET)},
   {provider:'instagram',label:'Instagram',configured:Boolean(process.env.META_APP_ID&&process.env.META_APP_SECRET)},
   {provider:'linkedin',label:'LinkedIn',configured:Boolean(process.env.LINKEDIN_CLIENT_ID&&process.env.LINKEDIN_CLIENT_SECRET)},
   {provider:'tiktok',label:'TikTok',configured:Boolean(process.env.TIKTOK_CLIENT_KEY&&process.env.TIKTOK_CLIENT_SECRET)}
  ]},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return NextResponse.json({error:(e as Error).message||'Scheduler could not load'},{status:500});}
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client'||!allowedContent(c.workspace.role,c.workspace.permissions??[]))return NextResponse.json({error:'Content access required'},{status:403});
  const t=c.workspace.id,admin=supabaseAdmin(),body=await req.json(),action=String(body.action||'');
  if(action==='campaign_create'){
   const p=z.object({title:z.string().trim().min(1).max(160),client_id:id.nullable().optional()}).parse(body);
   const r=await admin.from('social_campaigns').insert({tenant_id:t,title:p.title,client_id:p.client_id??null,created_by:c.user.id}).select('id,client_id,title,status,created_at').single();
   if(r.error)throw r.error;return NextResponse.json(r.data,{status:201});
  }
  if(action==='campaign_assign'){
   const p=z.object({post_id:id,campaign_id:id.nullable()}).parse(body);
   const post=await admin.from('social_posts').select('id').eq('tenant_id',t).eq('id',p.post_id).single();if(post.error)throw new Error('Post not found.');
   const r=await admin.from('social_posts').update({campaign_id:p.campaign_id}).eq('tenant_id',t).eq('id',p.post_id).select('id,campaign_id').single();if(r.error)throw r.error;return NextResponse.json(r.data);
  }
  if(action==='schedule'){
   const p=z.object({post_id:id,account_ids:z.array(id).min(1).max(10),scheduled_at:z.iso.datetime({offset:true}),copy:z.string().max(5000).optional()}).parse(body);
   const post=await admin.from('social_posts').select('id,title,description,status').eq('tenant_id',t).eq('id',p.post_id).single();
   if(post.error||post.data.status!=='approved')return NextResponse.json({error:'Only approved content can be scheduled.'},{status:400});
   const accounts=await admin.from('social_accounts').select('id,provider,status').eq('tenant_id',t).in('id',p.account_ids);
   if(accounts.error||accounts.data.length!==p.account_ids.length)return NextResponse.json({error:'One or more social accounts are unavailable.'},{status:400});
   if(accounts.data.some(a=>a.status!=='active'))return NextResponse.json({error:'Connect every selected social account before scheduling.'},{status:400});
   const rows=accounts.data.map(a=>({tenant_id:t,post_id:p.post_id,account_id:a.id,provider:a.provider,scheduled_at:p.scheduled_at,copy:p.copy??post.data.description??post.data.title,created_by:c.user.id}));
   const r=await admin.from('social_publish_jobs').insert(rows).select('id,post_id,account_id,provider,scheduled_at,status');if(r.error)throw r.error;return NextResponse.json(r.data,{status:201});
  }
  if(action==='retry'){
   const p=z.object({job_id:id}).parse(body);const r=await admin.from('social_publish_jobs').update({status:'scheduled',scheduled_at:new Date().toISOString(),last_error:null}).eq('tenant_id',t).eq('id',p.job_id).eq('status','failed').select().single();if(r.error)throw r.error;return NextResponse.json(r.data);
  }
  if(action==='cancel'){
   const p=z.object({job_id:id}).parse(body);const r=await admin.from('social_publish_jobs').update({status:'cancelled'}).eq('tenant_id',t).eq('id',p.job_id).in('status',['scheduled','failed']).select().single();if(r.error)throw r.error;return NextResponse.json(r.data);
  }
  return NextResponse.json({error:'Unknown scheduler action'},{status:400});
 }catch(e){return NextResponse.json({error:e instanceof z.ZodError?e.issues.map(i=>i.message).join('; '):(e as Error).message||'Scheduler action failed'},{status:400});}
}
