import {PublicError} from './public-services';
import {database,livePayments} from './domain-store';

export function paymentConfirmed(body:any,session:any) {
  // Exact status matching: strings such as "unsuccessful" must never confirm payment.
  const status=String(body?.status??body?.message??'').trim().toLowerCase();
  return body?.error===false&&body.responseCode==='000'&&['success','successful','payment successful','transaction successful'].includes(status)
    &&body.reference===session.reference&&body.currency===session.currency
    &&Number.isFinite(Number(body.amount))&&Math.round(Number(body.amount)*100)===session.amount_cents
    &&typeof body.paymentReference==='string'&&body.paymentReference.length>0&&body.paymentReference.length<=200;
}
export async function omari(path:string,body?:unknown) {
  if(!livePayments())throw new PublicError('Omari payments are not open yet. No money has been taken.',503);
  // Fixed verified production origin; UAT and arbitrary override URLs cannot receive customer payments.
  const result=await fetch('https://omari.v.co.zw/vsuite/omari/api/merchant/api/payment'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Merchant-Key':process.env.OMARI_API_KEY!},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!result.ok)throw new PublicError('Omari could not confirm this request. Check payment status before trying again.',503);
  return result.json();
}
export async function serviceDb(path:string,body?:unknown,method='POST') {
  if(!livePayments())throw new PublicError('Omari payments are not open yet. No money has been taken.',503);
  return database(path,process.env.SUPABASE_SERVICE_ROLE_KEY!,body,method);
}
export async function reconcile(session:any,userId:string) {
  const result=await omari('/query/'+encodeURIComponent(session.reference));
  if(!paymentConfirmed(result,session))return null;
  return serviceDb('rpc/nxt_domain_confirm_payment',{p_order:session.order_id,p_user:userId,p_reference:session.reference,p_payment_reference:result.paymentReference,p_amount_cents:session.amount_cents,p_currency:session.currency});
}
