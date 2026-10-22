import {createClient} from '@supabase/supabase-js';
export type OmariMode='uat'|'production';
function required(name:string){const value=process.env[name];if(!value)throw new Error(name+' is not configured');return value;}
export function mode():OmariMode{return process.env.OMARI_MODE==='production'?'production':'uat';}
export function baseUrl(){return (process.env.OMARI_BASE_URL||(mode()==='production'?'https://omari.v.co.zw/vsuite/omari/api/merchant/api/payment':'https://omari.v.co.zw/uat/vsuite/omari/api/merchant/api/payment')).replace(/\/$/,'');}
export function adminDb(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});}
async function call(path:string,init:RequestInit={}){
 const r=await fetch(baseUrl()+path,{...init,headers:{'Content-Type':'application/json','X-Merchant-Key':required('OMARI_API_KEY'),...(init.headers||{})},cache:'no-store'});
 let body:any;try{body=await r.json();}catch{throw new Error('Omari returned an unreadable response');}
 if(!r.ok)throw new Error(body?.message||'Omari request failed');return body;
}
export async function authPayment(v:{msisdn:string;reference:string;amount:number;currency:'USD'|'ZWG'}){return call('/auth',{method:'POST',body:JSON.stringify({...v,channel:'WEB'})});}
export async function requestPayment(v:{msisdn:string;reference:string;otp:string}){return call('/request',{method:'POST',body:JSON.stringify(v)});}
export async function queryPayment(reference:string){return call('/query/'+encodeURIComponent(reference),{method:'GET'});}
export function successful(body:any){return body&&body.error===false&&body.responseCode==='000'&&String(body.status??body.message??'').toLowerCase().includes('success');}
