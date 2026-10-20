import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 const key=process.env.RESEND_API_KEY,from=process.env.NOTIFICATION_FROM,service=process.env.SUPABASE_SERVICE_ROLE_KEY,url=process.env.NEXT_PUBLIC_SUPABASE_URL,app=process.env.NEXT_PUBLIC_APP_URL;
 if(!key||!from||!service||!url||!app)return NextResponse.json({error:'Email delivery is not configured.'},{status:503});
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.from('notification_outbox').select('*').is('sent_at',null).lt('attempts',5).order('created_at').limit(25);
 if(error)return NextResponse.json({error:'Queue unavailable'},{status:500});
 let sent=0;
 for(const n of data??[]){
  try{
   const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`nxt-${n.id}`},body:JSON.stringify({from,to:[n.recipient],subject:n.subject,text:`${n.body}\n\n${app}/app`}),signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw new Error(`Email provider returned ${r.status}`);
   const saved=await db.from('notification_outbox').update({sent_at:new Date().toISOString(),attempts:n.attempts+1,last_error:null}).eq('id',n.id).is('sent_at',null);
   if(saved.error)throw new Error('Delivery status could not be saved');sent++;
  }catch(e){await db.from('notification_outbox').update({attempts:n.attempts+1,last_error:(e as Error).message}).eq('id',n.id).is('sent_at',null);}
 }
 return NextResponse.json({sent,checked:data?.length??0});
}
