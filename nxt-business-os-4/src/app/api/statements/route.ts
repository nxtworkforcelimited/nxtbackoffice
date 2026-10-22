import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {z} from 'zod';
import {accountStatement,type StatementInvoice,type StatementPayment} from '@/lib/account-statement';
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client'||!(c.workspace.role==='owner'||c.workspace.permissions?.includes('finance')))return NextResponse.json({error:'Finance access required'},{status:403});
 const q=z.object({client:z.uuid(),from:z.iso.date(),to:z.iso.date(),currency:z.enum(['USD','ZWG','GBP','AUD'])}).refine(v=>v.from<=v.to,'Start date must be before end date').safeParse(Object.fromEntries(['client','from','to','currency'].map(k=>[k,req.nextUrl.searchParams.get(k)])));
 if(!q.success)return NextResponse.json({error:'Select a customer, currency and valid date range.'},{status:400});
 const {client,from,to,currency}=q.data;
 const customer=await c.db.from('clients').select('id,title,email,description').eq('tenant_id',c.workspace.id).eq('id',client).maybeSingle();
 if(customer.error||!customer.data)return NextResponse.json({error:'Customer unavailable'},{status:404});
 const invoices:StatementInvoice[]=[],payments:StatementPayment[]=[];
 // Paginate both sources: a statement must never silently stop at the database row limit.
 for(const table of ['business_items','invoice_payments'] as const){
  let complete=false;
  for(let offset=0;offset<100000;offset+=1000){
   let query=c.db.from(table).select(table==='business_items'?'id,reference,title,total,created_at,due_date,status,deleted_at':'id,invoice_id,reference,amount,created_at,payment_method').eq('tenant_id',c.workspace.id).order('id').range(offset,offset+999);
   if(table==='business_items')query=query.eq('kind','invoice').eq('client_id',client).eq('currency',currency).in('status',['issued','paid']).is('deleted_at',null);
   const r=await query;if(r.error)return NextResponse.json({error:'Unable to load the complete statement. Please retry.'},{status:400});
   if(table==='business_items')invoices.push(...r.data as unknown as StatementInvoice[]);else payments.push(...r.data as unknown as StatementPayment[]);
   if(r.data.length<1000){complete=true;break;}
  }
  if(!complete)return NextResponse.json({error:'Statement is too large to load safely. Contact your administrator.'},{status:400});
 }
 return NextResponse.json({customer:customer.data,currency,from,to,...accountStatement(invoices,payments,from,to)},{headers:{'Cache-Control':'private, no-store'}});
}
