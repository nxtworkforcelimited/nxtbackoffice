import {PublicError} from './public-services';

export const domainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:co\.zw|com|co\.uk|co\.com|co\.za|net|org)$/;
export function settings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new PublicError('Customer accounts are temporarily unavailable. Please try again later.', 503);
  return {url: url.replace(/\/$/, ''), key};
}
export async function database(path: string, token: string, body?: unknown, method = 'POST') {
  const {url,key}=settings();
  const response=await fetch(url+'/rest/v1/'+path, {method, headers:{apikey:key, Authorization:'Bearer '+token, 'Content-Type':'application/json', Prefer:'return=representation'}, body:body===undefined?undefined:JSON.stringify(body), cache:'no-store', signal:AbortSignal.timeout(12000)});
  const result=await response.json().catch(()=>null);
  if(!response.ok) {
    const known=['Prices are not published for this extension','Order is unavailable','Sign in with a verified email','Order already exists with different details'];
    throw new PublicError(known.includes(result?.message)?result.message:'We could not save or load your order. Please try again.',response.status===401?401:503);
  }
  return result;
}
export function cookie(request:Request,name:string) {
  return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||'';
}
export async function customer(request:Request) {
  const token=cookie(request,'__Host-nxt-customer-access');
  if(!token)throw new PublicError('Please sign in to your customer account.',401);
  const {url,key}=settings();
  const response=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(response.status>=500)throw new PublicError('Sign-in is temporarily unavailable.',503);
  const user=await response.json().catch(()=>null);
  if(!response.ok||!user?.id||!user.email_confirmed_at)throw new PublicError('Please sign in with a verified email.',401);
  return {id:user.id as string,email:user.email as string,token};
}
export function setSession(response:Response,session:{access_token:string;refresh_token:string;expires_in:number}) {
  if(!/^[A-Za-z0-9_.-]+$/.test(session.access_token)||!/^[A-Za-z0-9_.-]+$/.test(session.refresh_token))throw new Error('Invalid session');
  response.headers.append('Set-Cookie','__Host-nxt-customer-access='+session.access_token+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+Math.min(session.expires_in||3600,3600));
  response.headers.append('Set-Cookie','__Host-nxt-customer-refresh='+session.refresh_token+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=604800');
  return response;
}
export function clearSession(response:Response) {
  for(const name of ['access','refresh'])response.headers.append('Set-Cookie','__Host-nxt-customer-'+name+'=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');
  return response;
}
export function textField(value:unknown,label:string,optional=false,max=200) {
  if(value==null&&optional)return '';
  if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value)||(!optional&&!value.trim()))throw new PublicError('Please check '+label+'.');
  return value.trim();
}
export function checkoutDetails(v:any) {
  if(!v||typeof v!=='object'||v.consent!==true)throw new PublicError('Please accept the order terms.');
  const contact=(c:any)=>{
    if(!c||typeof c!=='object')throw new PublicError('Please complete your contact details.');
    const value=Object.fromEntries(['name','organisation','physical','postal','city','country','phone','email'].map(k=>[k,textField(c[k],k,false,k==='email'?254:200)]));
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)||!/^\+?[0-9][0-9 ()-]{6,30}$/.test(value.phone))throw new PublicError('Enter a valid email and phone number.');
    return value;
  };
  const billing=contact(v.billing),owner=v.ownerSame===true?billing:contact(v.owner);
  const notices=textField(v.notices||owner.physical,'legal notices address');
  if(/\bP\.?\s*O\.?\s*(box|bag)\b|\bpost\s*office\s*(box|bag)\b/i.test(notices))throw new PublicError('Use a street address for legal notices.');
  return {billing,owner,notices,description:textField(v.description,'core business'),usage:textField(v.usage,'domain use'),notes:textField(v.notes,'notes',true,1000),consent:true,termsVersion:'domain-checkout-v1'};
}
export function livePayments() {
  return process.env.NXT_DOMAIN_PAYMENTS_ENABLED==='true' && process.env.OMARI_MODE==='production' && !!process.env.OMARI_API_KEY && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}
