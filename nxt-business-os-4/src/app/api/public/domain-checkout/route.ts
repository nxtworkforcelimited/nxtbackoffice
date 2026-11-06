import {PublicError,readPublicJson,reply,publicFailure} from '../../../../lib/public-services';
import {settings,customer,database,domainPattern,checkoutDetails,livePayments} from '../../../../lib/domain-store';
import {POST as search} from '../domain-search/route';

export async function GET(request:Request) {
  try {
    const action=new URL(request.url).searchParams.get('action');
    if(action==='orders') {
      const user=await customer(request);
      const orders=await database('nxt_domain_orders?select=id,items,total_cents,currency,payment_status,fulfilment_status,created_at,paid_at,registered_at&customer_id=eq.'+user.id+'&order=created_at.desc&limit=50',user.token,undefined,'GET');
      return reply({orders,paymentsEnabled:livePayments()});
    }
    const {key}=settings();
    return reply({prices:await database('nxt_domain_prices?select=extension,registration_cents,renewal_cents,currency,enabled',key,undefined,'GET'),paymentsEnabled:livePayments()});
  }catch(e){return publicFailure(e);}
}
export async function POST(request:Request) {
  try {
    const v=await readPublicJson(request,16000),user=await customer(request);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.requestId||''))throw new PublicError('Please refresh your checkout.');
    if(!Array.isArray(v.domains)||!v.domains.length||v.domains.length>5||new Set(v.domains).size!==v.domains.length||v.domains.some((d:unknown)=>typeof d!=='string'||!domainPattern.test(d)))throw new PublicError('Choose up to five different domain names.');
    const details=checkoutDetails(v.details);
    // Never accept availability, prices, customer IDs or payment status from the browser.
    await Promise.all(v.domains.map(async(domain:string)=>{
      const result=await search(new Request(new URL('/api/public/domain-search',request.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:domain})}));
      const body=await result.json();
      const status=body.results?.find((r:any)=>r.domain===domain)?.status;
      if(status==='unavailable')throw new PublicError(domain+' is unavailable.',409);
      if(status!=='available')throw new PublicError('We could not check '+domain+'. Please try again.',503);
    }));
    const order=await database('rpc/nxt_domain_place_order',user.token,{p_id:v.requestId,p_domains:v.domains,p_details:details});
    return reply({order,paymentsEnabled:livePayments()},201);
  }catch(e){return publicFailure(e);}
}
