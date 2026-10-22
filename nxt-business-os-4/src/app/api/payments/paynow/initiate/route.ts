import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {trustedRequest} from '@/lib/request-origin';
import {z} from 'zod';
import {adminDb,initiatePaynow,newSessionId} from '@/lib/server/paynow';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return NextResponse.json({error:'Untrusted request'},{status:403});
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace)return NextResponse.json({error:'Sign in required'},{status:401});
  const p=z.object({invoice_id:z.uuid()}).parse(await req.json());
  const {data:invoice,error}=await c.db.from('business_items').select('*').eq('tenant_id',c.workspace.id).eq('id',p.invoice_id).eq('kind','invoice').single();
  if(error||!invoice)return NextResponse.json({error:'Invoice unavailable'},{status:404});
  if(invoice.status!=='issued')return NextResponse.json({error:'Only issued invoices can be paid online'},{status:400});
  if(invoice.currency!=='USD')return NextResponse.json({error:'Paynow online checkout is currently enabled for USD invoices only'},{status:400});
  const amount=Math.round((Number(invoice.total)-Number(invoice.paid))*100)/100;if(amount<=0)return NextResponse.json({error:'This invoice has no outstanding balance'},{status:400});
  const sessionId=newSessionId(),merchantReference=(invoice.reference+'-'+sessionId.slice(0,8)).slice(0,120),db=adminDb();
  const inserted=await db.from('paynow_transactions').insert({id:sessionId,tenant_id:c.workspace.id,invoice_id:invoice.id,initiated_by:c.user.id,merchant_reference:merchantReference,amount,currency:'USD',status:'initiating'}).select().single();
  if(inserted.error)throw new Error('Could not create payment session');
  try{
   const checkout=await initiatePaynow({sessionId,reference:merchantReference,amount,info:'Payment for '+invoice.reference+' · '+invoice.title,email:c.user.email??undefined});
   const saved=await db.from('paynow_transactions').update({browser_url:checkout.browserUrl,poll_url:checkout.pollUrl,status:'created',updated_at:new Date().toISOString()}).eq('id',sessionId);
   if(saved.error)throw new Error('Could not save Paynow checkout details');
   return NextResponse.json({redirect_url:checkout.browserUrl});
  }catch(e){await db.from('paynow_transactions').update({status:'error',updated_at:new Date().toISOString()}).eq('id',sessionId);throw e;}
 }catch(e){return NextResponse.json({error:e instanceof z.ZodError?'Invalid invoice':(e as Error).message},{status:400});}
}
