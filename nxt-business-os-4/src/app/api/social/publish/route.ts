import {NextRequest,NextResponse} from 'next/server';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {publishSocial} from '@/lib/server/social-publish';
export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(req:NextRequest){
 if(!process.env.CRON_SECRET||req.headers.get('authorization')!=='Bearer '+process.env.CRON_SECRET)return NextResponse.json({error:'Unauthorized'},{status:401});
 const admin=supabaseAdmin(),claimed=await admin.rpc('claim_social_publish_jobs',{p_limit:10});
 if(claimed.error)return NextResponse.json({error:claimed.error.message},{status:500});
 const results=[];
 for(const job of claimed.data??[]){
  try{
   const [account,post]=await Promise.all([
    admin.from('social_accounts').select('id,provider,account_name,external_account_id,token_cipher,status').eq('tenant_id',job.tenant_id).eq('id',job.account_id).single(),
    admin.from('social_posts').select('id,title,description,status').eq('tenant_id',job.tenant_id).eq('id',job.post_id).single()
   ]);
   if(account.error||post.error||account.data.status!=='active')throw new Error('Social account is unavailable.');
   const output=await publishSocial(account.data,post.data,job.copy);
   await admin.from('social_publish_jobs').update({status:'published',provider_post_id:output.providerPostId||null,provider_url:output.providerUrl||null,published_at:new Date().toISOString(),last_error:null}).eq('id',job.id);
   await admin.from('social_publish_events').insert({tenant_id:job.tenant_id,job_id:job.id,event:'published',detail:output});
   const remaining=await admin.from('social_publish_jobs').select('status').eq('tenant_id',job.tenant_id).eq('post_id',job.post_id).neq('status','cancelled');
   if(!remaining.error&&remaining.data.length&&remaining.data.every(x=>x.status==='published'))await admin.from('social_posts').update({status:'published'}).eq('tenant_id',job.tenant_id).eq('id',job.post_id);
   results.push({id:job.id,status:'published'});
  }catch(e){
   const error=(e as Error).message.slice(0,1000);
   await admin.from('social_publish_jobs').update({status:'failed',last_error:error}).eq('id',job.id);
   await admin.from('social_publish_events').insert({tenant_id:job.tenant_id,job_id:job.id,event:'failed',detail:{error}});
   results.push({id:job.id,status:'failed',error});
  }
 }
 return NextResponse.json({processed:results.length,results});
}
