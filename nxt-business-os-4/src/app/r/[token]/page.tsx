import type {Metadata} from 'next';
import {createClient} from '@supabase/supabase-js';
import {verifyReceipt} from '@/lib/server/receipt-link';
import {shortReceipt} from '@/lib/sms-templates';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Payment receipt',robots:{index:false,follow:false,nocache:true},referrer:'no-referrer'};

const money=(c:string,v:number)=>c+' '+Number(v).toFixed(2);
const date=(v:string)=>new Date(v).toLocaleDateString('en-GB',{timeZone:'Africa/Harare',day:'numeric',month:'long',year:'numeric'});
const methodName=(m:string|null)=>m==='cash'?'Cash':m==='bank'?'Bank transfer':m?m[0].toUpperCase()+m.slice(1):'Not specified';

async function find(token:string){
 const id=verifyReceipt(token),url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!id||!url||!key)return null;
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const pay=await db.from('invoice_payments').select('id,tenant_id,invoice_id,amount,reference,payment_method,created_at').eq('id',id).maybeSingle();
 if(!pay.data)return null;
 const inv=await db.from('business_items').select('reference,title,client_id,total,paid,currency').eq('tenant_id',pay.data.tenant_id).eq('id',pay.data.invoice_id).maybeSingle();
 if(!inv.data)return null;
 const [client,tenant]=await Promise.all([
  inv.data.client_id?db.from('clients').select('title').eq('tenant_id',pay.data.tenant_id).eq('id',inv.data.client_id).maybeSingle():Promise.resolve({data:null}),
  db.from('tenants').select('name').eq('id',pay.data.tenant_id).maybeSingle()
 ]);
 return {pay:pay.data,inv:inv.data,client:client.data?.title??'',company:tenant.data?.name??'NXT Workforce'};
}

export default async function ReceiptPage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 const r=await find(token);
 const shell:React.CSSProperties={maxWidth:520,margin:'0 auto',padding:'48px 24px',fontFamily:'Montserrat,system-ui,sans-serif',color:'#0f172a'};
 if(!r)return <main style={{background:'#fff',minHeight:'100vh'}}><div style={shell}><h1 style={{fontSize:22}}>Receipt not found</h1><p>This link is not valid. Please contact NXT Workforce at hello@nxt-workforce.com and we will resend your receipt.</p></div></main>;
 const balance=Math.max(0,Math.round((Number(r.inv.total)-Number(r.inv.paid))*100)/100);
 const row:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:16,padding:'12px 0',borderBottom:'1px solid #e2e8f0'};
 return <main style={{background:'#fff',minHeight:'100vh'}}><div style={shell}>
  <div style={{textAlign:'center',padding:'8px 0 36px'}}><img src="/brand/nxt-business-os.png" alt="NXT Business OS" style={{maxWidth:200,height:'auto'}}/></div>
  <h1 style={{fontSize:24,margin:'0 0 4px'}}>Payment receipt</h1>
  <p style={{margin:'0 0 24px',opacity:.7}}>{shortReceipt(r.pay.id)} · {date(r.pay.created_at)}</p>
  {r.client&&<p style={{margin:'0 0 8px'}}>Received from <strong>{r.client}</strong></p>}
  <p style={{margin:'0 0 24px',opacity:.8}}>Invoice {r.inv.reference}{r.inv.title?' - '+r.inv.title:''}</p>
  <div style={row}><span>Amount received</span><strong>{money(r.inv.currency,Number(r.pay.amount))}</strong></div>
  <div style={row}><span>Payment method</span><span>{methodName(r.pay.payment_method)}</span></div>
  <div style={row}><span>Payment reference</span><span style={{overflowWrap:'anywhere',textAlign:'right'}}>{r.pay.reference}</span></div>
  <div style={row}><span>Invoice total</span><span>{money(r.inv.currency,Number(r.inv.total))}</span></div>
  <div style={row}><span>Balance remaining</span><strong>{money(r.inv.currency,balance)}</strong></div>
  <p style={{marginTop:28}}>Thank you for your payment.</p>
  <footer style={{fontSize:11,marginTop:56,opacity:.7,textAlign:'center'}}>{r.company} · hello@nxt-workforce.com · www.nxt-workforce.com</footer>
 </div></main>;
}
