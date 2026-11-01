import type {SupabaseClient} from '@supabase/supabase-js';

/** Processes one explicitly authorised staff-access request. No setup links or passwords are returned or logged. */
export async function processFinanceOnboarding(db:SupabaseClient,app:string,send:(email:string,subject:string,body:string,id:string)=>Promise<void>){
 const claimed=await db.rpc('claim_finance_staff_request');
 if(claimed.error)return {checked:0,sent:0,error:'Staff onboarding queue unavailable'};
 const q=claimed.data as null|{id:string;tenant_id:string;email:string;name:string;account_id:string|null;capabilities?:string[];job_title?:string;department?:string};
 if(!q)return {checked:0,sent:0};
 try{
  const origin=new URL(app);if(origin.protocol!=='https:')throw Error('Portal must use HTTPS');
  const generated=await db.auth.admin.generateLink({type:q.account_id?'recovery':'invite',email:q.email});
  const properties=generated.data?.properties,account=generated.data?.user;
  if(generated.error||!account||account.email?.toLowerCase()!==q.email||!properties?.hashed_token||!['invite','recovery'].includes(properties.verification_type))throw Error('Account invitation could not be generated');
  const linked=await db.rpc('link_finance_staff_request',{request_id:q.id,account:account.id});
  if(linked.error)throw Error('Account permissions could not be linked safely');
  const url=new URL('/auth/accept',origin.origin);url.searchParams.set('token_hash',properties.hashed_token);url.searchParams.set('type',properties.verification_type);
  const apps=(q.capabilities??[]).map(x=>x.replaceAll('_',' ')).join(', ')||'standard staff apps';
  await send(q.email,'Your NXT Business OS staff access',`Hello ${q.name},

NXT Workforce has created your staff access to NXT Business OS.

Your assigned access includes: ${apps}.

Choose your own password using this single-use link:
${url}

After setup, sign in at ${origin.origin}/login. No password is included in this email. Your access does not grant workspace ownership.

If you did not expect this invitation, contact your NXT Workforce administrator.`,q.id);
  const saved=await db.from('staff_access_requests').update({status:'sent',sent_at:new Date().toISOString(),last_error:null}).eq('id',q.id).eq('status','processing');
  if(saved.error)return {checked:1,sent:1,error:'Provider accepted invitation; status needs reconciliation'};
  return {checked:1,sent:1};
 }catch{
  await db.from('staff_access_requests').update({status:'failed',last_error:'Onboarding did not complete. Review account/email status before sending a new invitation.'}).eq('id',q.id).eq('status','processing');
  return {checked:1,sent:0,error:'Staff onboarding needs review'};
 }
}
