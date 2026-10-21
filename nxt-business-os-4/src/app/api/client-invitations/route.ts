import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {context} from '@/lib/context';
import {deliverClientInvitation} from '@/lib/server/client-invitations';
import {trustedRequest} from '@/lib/request-origin';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){
 try{
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c)return reply({error:'Please sign in again.'},401);
 if(!c.workspace||c.workspace.role!=='owner')return reply({error:'Only the workspace owner can manage client access.'},403);
 const id=z.uuid().safeParse(req.nextUrl.searchParams.get('client'));if(!id.success)return reply({error:'Select a client'},400);
 const [history,state]=await Promise.all([c.db.from('client_invitations').select('id,email,status,purpose,created_at,sent_at,last_error').eq('tenant_id',c.workspace.id).eq('client_id',id.data).order('created_at',{ascending:false}).limit(10),c.db.rpc('client_portal_state',{t:c.workspace.id,c:id.data})]);
 if(history.error||state.error)return reply({error:'Client access status could not load. Please retry or ask your administrator to check the client-access upgrade.'},503);
 return reply({history:history.data??[],account:state.data});
 }catch{return reply({error:'Client access is temporarily unavailable. Your session has not been changed.'},503);}
}
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'This request could not be verified. Open the portal directly and retry.'},403);
 try{
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c)return reply({error:'Please sign in again.'},401);
 if(!c.workspace||c.workspace.role!=='owner')return reply({error:'Only the workspace owner can manage client access.'},403);
 const p=z.object({client_id:z.uuid(),purpose:z.enum(['invite','reset']).default('invite')}).safeParse(await req.json().catch(()=>null));if(!p.success)return reply({error:'Select a client and a valid access action.'},400);
 if(p.data.purpose==='reset'){const state=await c.db.rpc('client_portal_state',{t:c.workspace.id,c:p.data.client_id});if(state.error||!state.data?.linked)return reply({error:'Invite this client first. No linked account was found for the saved email.'},400);if(state.data.suspended)return reply({error:'This account is suspended. A password reset cannot restore suspended access.'},400);}
 const key=process.env.RESEND_API_KEY,from=process.env.NOTIFICATION_FROM,secret=process.env.SUPABASE_SERVICE_ROLE_KEY,url=process.env.NEXT_PUBLIC_SUPABASE_URL,app=process.env.NEXT_PUBLIC_APP_URL;
 if(!key||!from||!secret||!url||!app)return reply({error:'Client email invitations are not configured.'},503);
 let appUrl:URL;try{appUrl=new URL(app);if(appUrl.protocol!=='https:')throw Error();}catch{return reply({error:'The portal URL must be configured as an HTTPS address.'},503);}
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const result=await deliverClientInvitation({workspace:c.workspace.id,clientId:p.data.client_id,purpose:p.data.purpose,db:c.db,admin,appUrl:appUrl.origin,send:async(email,subject,body,id)=>{
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`nxt-client-invite-${id}`},body:JSON.stringify({from,to:[email],subject,text:body}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('The email provider could not accept this email. Check delivery settings and retry.');
 }});
 return reply(result);
 }catch(e){return reply({error:(e as Error).message||'Client access could not be updated. Please retry.'},400);}
}
