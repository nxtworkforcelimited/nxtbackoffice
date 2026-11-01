import {PublicError,readPublicJson,reply,publicFailure} from '../../../../lib/public-services';
import {customer,database,livePayments} from '../../../../lib/domain-store';
import {serviceDb,omari,reconcile} from '../../../../lib/domain-payment';
import {POST as search} from '../domain-search/route';

export async function POST(request:Request) {
  try {
    const v=await readPublicJson(request,2000),user=await customer(request);
    if(!livePayments())throw new PublicError('Omari payments are not open yet. No money has been taken.',503);
    if(!['auth','pay','status'].includes(v.action)||!/^[-a-f0-9]{36}$/.test(v.orderId||''))throw new PublicError('Choose an order from your account.');
    const [order]=await database('nxt_domain_orders?id=eq.'+v.orderId+'&customer_id=eq.'+user.id,user.token,undefined,'GET');
    if(!order)throw new PublicError('Order is unavailable.',404);
    if(order.payment_status==='paid')return reply({paid:true,order});
    if(order.payment_status!=='unpaid'||order.fulfilment_status==='cancelled')throw new PublicError('This order cannot be paid.',409);
    let [session]=await serviceDb('nxt_domain_payments?order_id=eq.'+order.id+'&customer_id=eq.'+user.id,undefined,'GET');
    if(v.action==='auth'&&!session) {
      if(!/^2637\d{8}$/.test(v.msisdn||''))throw new PublicError('Enter your Omari number as 2637XXXXXXXX.');
      for(const item of order.items) {
        const result=await search(new Request(new URL('/api/public/domain-search',request.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:item.domain})}));
        const checked=await result.json();
        if(checked.results?.find((r:any)=>r.domain===item.domain)?.status!=='available')throw new PublicError('We cannot confirm '+item.domain+' is available. Contact NXT before paying.',409);
      }
      try { [session]=await serviceDb('nxt_domain_payments',{order_id:order.id,customer_id:user.id,msisdn:v.msisdn,amount_cents:order.total_cents,currency:order.currency}); }
      catch { [session]=await serviceDb('nxt_domain_payments?order_id=eq.'+order.id+'&customer_id=eq.'+user.id,undefined,'GET');if(!session)throw new PublicError('Could not start payment. Please retry.',503); }
    }
    if(!session)throw new PublicError('Start your Omari payment first.');
    if(session.state==='paid')return reply({paid:true,order});
    if(v.action==='status'||['processing','auth_pending','needs_attention'].includes(session.state)) {
      const confirmed=await reconcile(session,user.id);
      return reply(confirmed?{paid:true,order:confirmed}:{pending:true,message:'Payment is not confirmed yet. Check again shortly. Do not start a second payment.'});
    }
    if(v.action==='auth') {
      if(session.state==='otp_sent')return reply({otpSent:true,message:'Use the OTP already sent to your Omari number.'});
      const claimed=await serviceDb('nxt_domain_payments?id=eq.'+session.id+'&state=eq.created',{state:'auth_pending',updated_at:new Date().toISOString()},'PATCH');
      if(!claimed.length)return reply({pending:true,message:'Your payment request is being checked.'});
      const result=await omari('/auth',{msisdn:session.msisdn,reference:session.reference,amount:session.amount_cents/100,currency:session.currency,channel:'WEB'});
      if(result?.error!==false||result.responseCode!=='000'||!result.otpReference) {
        await serviceDb('nxt_domain_payments?id=eq.'+session.id,{state:'needs_attention'},'PATCH');
        throw new PublicError('Omari could not send an OTP. Contact NXT with your order number.',503);
      }
      await serviceDb('nxt_domain_payments?id=eq.'+session.id+'&state=eq.auth_pending',{state:'otp_sent',otp_reference:String(result.otpReference),updated_at:new Date().toISOString()},'PATCH');
      return reply({otpSent:true,message:'Enter the OTP sent by Omari.'});
    }
    if(!/^\d{4,12}$/.test(v.otp||''))throw new PublicError('Enter the OTP sent by Omari.');
    const claimed=await serviceDb('nxt_domain_payments?id=eq.'+session.id+'&state=eq.otp_sent',{state:'processing',updated_at:new Date().toISOString()},'PATCH');
    if(!claimed.length)return reply({pending:true,message:'Check payment status before trying again.'});
    // Exactly one debit request per reference. A timeout is uncertain, never a reason to charge again.
    await omari('/request',{msisdn:session.msisdn,reference:session.reference,otp:v.otp});
    const confirmed=await reconcile(session,user.id);
    return reply(confirmed?{paid:true,order:confirmed}:{pending:true,message:'Payment is not confirmed yet. Check payment status shortly.'});
  }catch(e){return publicFailure(e);}
}
