import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const compile=async p=>ts.transpileModule(await fs.readFile(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const helpers=uri(await compile('src/lib/public-services.ts'));
const store=uri((await compile('src/lib/domain-store.ts')).replace('./public-services',helpers));
const pay=uri((await compile('src/lib/domain-payment.ts')).replace('./public-services',helpers).replace('./domain-store',store));
const {paymentConfirmed}=await import(pay);
const {checkoutDetails,livePayments,setSession}=await import(store);
const session={reference:'ref-1',currency:'USD',amount_cents:1000};
test('Omari requires exact successful status, reference, currency, amount and receipt',()=>{
 const good={error:false,responseCode:'000',status:'SUCCESS',reference:'ref-1',currency:'USD',amount:10,paymentReference:'omari-1'};
 assert.equal(paymentConfirmed(good,session),true);
 for(const change of [{status:'unsuccessful'},{status:'pending'},{status:'success but reversed'},{error:true},{responseCode:'500'},{reference:'other'},{currency:'ZWG'},{amount:9.99},{amount:'NaN'},{paymentReference:''}])assert.equal(paymentConfirmed({...good,...change},session),false);
});
test('live payments fail closed without every production setting',()=>{
 const env={...process.env};try{delete process.env.NXT_DOMAIN_PAYMENTS_ENABLED;delete process.env.OMARI_API_KEY;assert.equal(livePayments(),false);Object.assign(process.env,{NXT_DOMAIN_PAYMENTS_ENABLED:'true',OMARI_MODE:'uat',OMARI_API_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test'});assert.equal(livePayments(),false);process.env.OMARI_MODE='production';assert.equal(livePayments(),true);delete process.env.SUPABASE_SERVICE_ROLE_KEY;assert.equal(livePayments(),false);}finally{for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
});
const contact={name:'Test Owner',organisation:'Example Ltd',physical:'1 Sample Road',postal:'1 Sample Road',city:'Harare',country:'Zimbabwe',phone:'263790000001',email:'owner@example.invalid'};
const details=()=>({billing:{...contact},ownerSame:true,description:'Technology',usage:'Website and email',notices:'1 Sample Road',notes:'',consent:true});
test('checkout collects customer details only and cannot inject provider, amount or statuses',()=>{
 const clean=checkoutDetails({...details(),amount:1,status:'paid',nameservers:['evil']});assert.equal(clean.owner.email,contact.email);assert.equal(clean.amount,undefined);assert.equal(clean.nameservers,undefined);
 assert.throws(()=>checkoutDetails({...details(),consent:false}));assert.throws(()=>checkoutDetails({...details(),notices:'PO Box 3'}));assert.throws(()=>checkoutDetails({...details(),billing:{...contact,name:'X\nY'}}));
 const response=setSession(Response.json({ok:true}),{access_token:'token',refresh_token:'refresh',expires_in:5000});for(const cookie of response.headers.getSetCookie()){assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);assert.match(cookie,/Path=\//);}
});
test('database isolates accounts, prices orders itself, rejects duplicates and reconciles payment once',async()=>{
 const db=new PGlite();
 const u='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003',ref='00000000-0000-4000-8000-000000000004';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table public.tenants(id uuid,slug text);create table public.memberships(user_id uuid,tenant_id uuid,role text);grant select on public.tenants,public.memberships to authenticated;insert into auth.users values('${u}','user@example.invalid',now()),('${other}','other@example.invalid',now());`);
 await db.exec(await fs.readFile('supabase/migrations/20261101164010_domain_customer_checkout.sql','utf8'));
 const d=checkoutDetails(details());
 const place=(o=id,dom=['example.co.zw'],det=d)=>db.query('select public.nxt_domain_place_order($1,$2,$3) as value',[o,JSON.stringify(dom),JSON.stringify(det)]);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${u}',false)`);
 await assert.rejects(place(),/Prices are not published/);
 await db.exec("reset role;update public.nxt_domain_prices set registration_cents=1500,renewal_cents=1800,enabled=true where extension='co.zw';set role authenticated;");
 await assert.rejects(place(id,['example.co.zw','example.co.zw']),/Duplicate/);
 await assert.rejects(place(id,['example.co.zw'],{...d,consent:null}),/Invalid order/);
 let order=(await place()).rows[0].value;assert.equal(order.total_cents,1500);assert.equal(order.items[0].renewal_cents,1800);assert.equal(order.payment_status,'unpaid');assert.equal(order.fulfilment_status,'pending');
 assert.equal((await place()).rows[0].value.id,id);
 await assert.rejects(place(id,['another.co.zw']),/different details/);
 await assert.rejects(db.exec(`update public.nxt_domain_orders set payment_status='paid' where id='${id}'`),/permission denied/);
 await assert.rejects(db.exec("update public.nxt_domain_prices set registration_cents=1"),/permission denied/);
 await assert.rejects(db.exec("select * from public.nxt_domain_payments"),/permission denied/);
 await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
 assert.equal((await db.query('select * from public.nxt_domain_orders')).rows.length,0);
 await assert.rejects(place(),/different details/);
 await assert.rejects(db.query('select public.nxt_domain_confirm_payment($1,$2,$3,$4,$5,$6)',[id,other,ref,'omari-paid',1500,'USD']),/permission denied/);
 await db.exec(`reset role;set role service_role;insert into public.nxt_domain_payments(order_id,customer_id,reference,msisdn,amount_cents,currency,state) values('${id}','${u}','${ref}','263790000001',1500,'USD','processing');`);
 const confirm=(cents=1500,customer=u,payref='omari-paid')=>db.query('select public.nxt_domain_confirm_payment($1,$2,$3,$4,$5,$6) as value',[id,customer,ref,payref,cents,'USD']);
 await assert.rejects(confirm(100),/mismatch/);await assert.rejects(confirm(1500,other),/unavailable/);
 order=(await confirm()).rows[0].value;assert.equal(order.payment_status,'paid');assert.equal(order.fulfilment_status,'pending');assert.equal(order.registered_at,null);
 assert.equal((await confirm()).rows[0].value.payment_reference,'omari-paid');await assert.rejects(confirm(1500,u,'other-receipt'),/mismatch/);
 await db.exec(`reset role;set role anon;`);await assert.rejects(place(),/permission denied/);await assert.rejects(db.query('select * from public.nxt_domain_orders'),/permission denied/);
 }finally{await db.close();}
});
