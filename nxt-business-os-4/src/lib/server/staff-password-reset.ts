import type {SupabaseClient} from '@supabase/supabase-js';
/** Recovery for an existing staff identity only. No permission/account/password mutations. */
export async function processStaffPasswordReset(db:SupabaseClient,app:string,send:(email:string,subject:string,body:string,id:string)=>Promise<void>){
 const claim=await db.rpc('claim_staff_password_reset');
 if(claim.error)return {checked:0,sent:0,error:'Staff password-reset queue unavailable'};
 const q=claim.data as null|{id:string;tenant_id:string;user_id:string;email:string;name:string};
 if(!q)return {checked:0,sent:0};
 try{
  const origin=new URL(app);if(origin.protocol!=='https:'||origin.username||origin.password)throw Error('Invalid portal origin');
  const {data,error}=await db.auth.admin.generateLink({type:'recovery',email:q.email});
  if(error||data?.user?.id!==q.user_id||data.user.email?.toLowerCase()!==q.email||data.properties?.verification_type!=='recovery'||!data.properties.hashed_token)throw Error('Recovery identity mismatch');
  const link=new URL('/auth/accept',origin.origin);link.searchParams.set('token_hash',data.properties.hashed_token);link.searchParams.set('type','recovery');
  await send(q.email,'Reset your NXT Business OS password',`Hello ${q.name},\n\nYour NXT Workforce administrator requested a password reset to help you sign in.\n\nOpen this secure, single-use link in your usual browser, choose Continue to password setup, and create a new password:\n${link}\n\nUse a password between 12 and 128 characters. Your email address is ${q.email}. Your existing workspace access and permissions have not been changed.\n\nAfter setup, sign in at ${origin.origin}/login using your new NXT Business OS password.\n\nReceiving this email does not change your password. If you were not expecting it, ignore this message and contact your administrator.`,q.id);
  const saved=await db.from('staff_password_reset_requests').update({status:'sent',sent_at:new Date().toISOString(),last_error:null}).eq('id',q.id).eq('tenant_id',q.tenant_id).eq('status','processing');
  return saved.error?{checked:1,sent:1,error:'Provider accepted reset email; status needs reconciliation'}:{checked:1,sent:1};
 }catch{
  // Never log/store the token, generated link, or provider response body. Do not regenerate on an uncertain send.
  await db.from('staff_password_reset_requests').update({status:'failed',last_error:'Password-reset delivery did not complete. Check account and delivery status before requesting another.'}).eq('id',q.id).eq('tenant_id',q.tenant_id).eq('status','processing');
  return {checked:1,sent:0,error:'Staff password-reset delivery needs review'};
 }
}
