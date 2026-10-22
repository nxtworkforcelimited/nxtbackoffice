import {createHash,timingSafeEqual,randomUUID} from 'crypto';
import {createClient} from '@supabase/supabase-js';

const endpoint='https://www.paynow.co.zw/interface/initiatetransaction';
const paidStatuses=new Set(['paid','awaiting delivery','delivered']);
export type PaynowFields=[string,string][];

function required(name:string){const v=process.env[name];if(!v)throw new Error(name+' is not configured');return v;}
export function paynowKey(){return required('PAYNOW_INTEGRATION_KEY');}
export function paynowId(){return required('PAYNOW_INTEGRATION_ID');}
export function appUrl(){return (process.env.NEXT_PUBLIC_APP_URL||'https://nxt-business-os.vercel.app').replace(/\/$/,'');}
export function adminDb(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});}
export function sha(values:string[],key=paynowKey()){return createHash('sha512').update(values.join('')+key,'utf8').digest('hex').toUpperCase();}
export function parseBody(raw:string):PaynowFields{return Array.from(new URLSearchParams(raw).entries());}
export function field(fields:PaynowFields,name:string){return fields.find(([k])=>k.toLowerCase()===name.toLowerCase())?.[1]??'';}
export function validHash(fields:PaynowFields){
 const supplied=field(fields,'hash').toUpperCase();if(!supplied)return false;
 const expected=sha(fields.filter(([k])=>k.toLowerCase()!=='hash').map(([,v])=>v));
 const a=Buffer.from(supplied),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);
}
export function paymentStatusPaid(status:string){return paidStatuses.has(status.trim().toLowerCase());}
export async function pollPaynow(url:string){
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},cache:'no-store'});
 const raw=await r.text();if(!r.ok)throw new Error('Paynow status check failed');
 const fields=parseBody(raw);if(!validHash(fields))throw new Error('Invalid Paynow status signature');return fields;
}
export async function initiatePaynow(input:{sessionId:string;reference:string;amount:number;info:string;email?:string}){
 const values:PaynowFields=[
  ['id',paynowId()],
  ['reference',input.reference],
  ['amount',input.amount.toFixed(2)],
  ['additionalinfo',input.info],
  ['returnurl',appUrl()+'/api/payments/paynow/return?session='+encodeURIComponent(input.sessionId)],
  ['resulturl',appUrl()+'/api/payments/paynow/result?session='+encodeURIComponent(input.sessionId)]
 ];
 if(input.email)values.push(['authemail',input.email]);
 values.push(['status','Message']);
 const body=new URLSearchParams(values);
 body.set('hash',sha(values.map(([,v])=>v)));
 const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),cache:'no-store'});
 const raw=await r.text();if(!r.ok)throw new Error('Paynow could not create the checkout');
 const fields=parseBody(raw);
 if(field(fields,'status').toLowerCase()!=='ok')throw new Error(field(fields,'error')||'Paynow rejected the checkout request');
 if(!validHash(fields))throw new Error('Invalid Paynow response signature');
 const browserUrl=field(fields,'browserurl'),pollUrl=field(fields,'pollurl');
 if(!browserUrl||!pollUrl)throw new Error('Paynow did not return checkout details');
 return {browserUrl,pollUrl};
}
export async function reconcilePaynowSession(sessionId:string,fields?:PaynowFields){
 const db=adminDb();
 const {data:session,error}=await db.from('paynow_transactions').select('*').eq('id',sessionId).single();
 if(error||!session)throw new Error('Payment session unavailable');
 let confirmed=fields;
 if(!confirmed){if(!session.poll_url)return session;confirmed=await pollPaynow(session.poll_url);}
 if(!validHash(confirmed))throw new Error('Invalid Paynow callback signature');
 const reference=field(confirmed,'reference'),status=field(confirmed,'status'),paynowReference=field(confirmed,'paynowreference'),amount=Number(field(confirmed,'amount'));
 if(reference!==session.merchant_reference||!Number.isFinite(amount)||Math.round(amount*100)!==Math.round(Number(session.amount)*100))throw new Error('Paynow payment details do not match the invoice');
 if(paymentStatusPaid(status)){
   const polled=session.poll_url?await pollPaynow(session.poll_url):confirmed;
   const pollStatus=field(polled,'status'),pollReference=field(polled,'reference'),pollAmount=Number(field(polled,'amount')),pollPaynowReference=field(polled,'paynowreference')||paynowReference;
   if(!paymentStatusPaid(pollStatus)||pollReference!==session.merchant_reference||Math.round(pollAmount*100)!==Math.round(Number(session.amount)*100))throw new Error('Paynow payment could not be independently confirmed');
   const {data,error:applyError}=await db.rpc('apply_paynow_payment',{session_id:session.id,paynow_reference:pollPaynowReference||paynowReference,payment_status:pollStatus});
   if(applyError)throw new Error(applyError.message);return data;
 }
 await db.from('paynow_transactions').update({status:status.toLowerCase(),paynow_reference:paynowReference||null,updated_at:new Date().toISOString()}).eq('id',session.id);
 return {...session,status:status.toLowerCase(),paynow_reference:paynowReference||null};
}
export function newSessionId(){return randomUUID();}
