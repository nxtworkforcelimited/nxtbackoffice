import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {context} from '@/lib/context';
import {deliverClientInvitation} from '@/lib/server/client-invitations';
import {z} from 'zod';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role!=='owner')return NextResponse.json({error:'Owner access required'},{status:403});
 const id=z.uuid().safeParse(req.nextUrl.searchParams.get('client'));if(!id.success)return NextResponse.json({error:'Select a client'},{status:400});
 const r=await c.db.from('client_invitations').select('id,email,status,created_at,sent_at,last_error').eq('tenant_id',c.workspace.id).eq('client_id',id.data).order('created_at',{ascending:false}).limit(5);
 return NextResponse.json(r.error?{error:'Client invitations are not configured yet.'}:r.data,{status:r.error?400:200,headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role!=='owner')return NextResponse.json({error:'Owner access required'},{status:403});
 const p=z.object({client_id:z.uuid()}).safeParse(await req.json().catch(()=>null));if(!p.success)return NextResponse.json({error:'Select a client'},{status:400});
 const key=process.env.RESEND_API_KEY,from=process.env.NOTIFICATION_FROM,secret=process.env.SUPABASE_SERVICE_ROLE_KEY,url=process.env.NEXT_PUBLIC_SUPABASE_URL,app=process.env.NEXT_PUBLIC_APP_URL;
 if(!key||!from||!secret||!url||!app)return NextResponse.json({error:'Client email invitations are not configured.'},{status:503});
 let appUrl:URL;try{appUrl=new URL(app);if(appUrl.protocol!=='https:')throw Error();}catch{return NextResponse.json({error:'The portal URL must be configured as an HTTPS address.'},{status:503});}
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
 const result=await deliverClientInvitation({workspace:c.workspace.id,clientId:p.data.client_id,db:c.db,admin,appUrl:appUrl.origin,send:async(email,subject,body,id)=>{
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`nxt-client-invite-${id}`},body:JSON.stringify({from,to:[email],subject,text:body}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('The email provider could not accept this invitation. Check delivery settings and retry.');
 }});
 return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return NextResponse.json({error:(e as Error).message},{status:400,headers:{'Cache-Control':'private, no-store'}});}
}
