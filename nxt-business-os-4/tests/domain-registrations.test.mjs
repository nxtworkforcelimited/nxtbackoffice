import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('website orders flow into an isolated admin queue with guarded registration updates',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now());
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;
   create table public.tenants(id uuid primary key,slug text);
   create table public.memberships(tenant_id uuid references tenants(id),user_id uuid references auth.users(id),role text,primary key(tenant_id,user_id));
   alter table public.memberships enable row level security;alter table public.tenants enable row level security;
   grant select on public.memberships,public.tenants to authenticated;
   create policy own_membership on public.memberships for select to authenticated using(user_id=auth.uid());
   create policy own_tenant on public.tenants for select to authenticated using(exists(select 1 from public.memberships m where m.tenant_id=tenants.id and m.user_id=auth.uid()));
   insert into tenants values('${id(10)}','nxt-workforce'),('${id(11)}','another-business');
   insert into auth.users(id,email) values('${id(1)}','owner@example.test'),('${id(2)}','admin@example.test'),('${id(3)}','staff@example.test'),('${id(4)}','customer@example.test'),('${id(5)}','other-admin@example.test'),('${id(6)}','second-customer@example.test');
   insert into memberships values('${id(10)}','${id(1)}','owner'),('${id(10)}','${id(2)}','admin'),('${id(10)}','${id(3)}','staff'),('${id(11)}','${id(5)}','admin');`);
  for(const name of ['20261101164010_domain_customer_checkout.sql','20261101173947_domain_registration_operations.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  await db.exec("update public.nxt_domain_prices set registration_cents=400,renewal_cents=400,enabled=true where extension='co.zw'");
  const as=async n=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false);`);
  const contact={name:'Example Owner',organisation:'Example Business',physical:'1 Example Street',postal:'1 Example Street',city:'Harare',country:'Zimbabwe',phone:'263700000000',email:'customer@example.test'};
  const details={owner:contact,billing:contact,description:'Example services',usage:'Website and email',notices:'1 Example Street',consent:true,termsVersion:'domain-checkout-v1'};
  const queue=(q='',status='',payment='',page=0)=>db.query('select public.nxt_domain_admin_queue($1,$2,$3,$4) q',[q,status,payment,page]).then(r=>r.rows[0].q);
  const update=(status,note='',reference='',version=0,order=20)=>db.query('select public.nxt_domain_update_registration($1,$2,$3,$4,$5) q',[id(order),version,status,note,reference]).then(r=>r.rows[0].q);
  await t.test('existing checkout RPC creates orders without granting OS membership',async()=>{
   for(const [user,order,domain] of [[4,20,'example-one.co.zw'],[6,21,'example-two.co.zw']]){
    await as(user);
    const {rows}=await db.query('select public.nxt_domain_place_order($1,$2,$3) q',[id(order),JSON.stringify([domain]),JSON.stringify(details)]);
    assert.equal(rows[0].q.payment_status,'unpaid');assert.equal(rows[0].q.fulfilment_version,0);
    assert.equal((await db.query('select * from memberships')).rows.length,0);
    assert.equal((await db.query('select * from nxt_domain_orders')).rows.length,1);
   }
  });
  await t.test('customer, staff, unrelated administrator and anonymous cannot operate the queue',async()=>{
   for(const user of [3,4,5,6]){await as(user);await assert.rejects(queue(),/administrator access/);await assert.rejects(update('needs_attention','Attempt'),/administrator access/);assert.equal((await db.query('select * from nxt_domain_events')).rows.length,0);}
   await db.exec('reset role;set role anon');await assert.rejects(queue(),/permission denied/);await assert.rejects(update('cancelled','Attempt'),/permission denied/);
  });
  await t.test('NXT owner and admin see both orders with real search, filtering and pagination',async()=>{
   for(const user of [1,2]){await as(user);const q=await queue();assert.equal(q.orders.length,2);assert.equal(q.total,2);assert.equal(q.counts.pending,2);assert.equal(q.unpaid,2);}
   assert.equal((await queue('EXAMPLE-ONE')).orders[0].id,id(20));
   assert.equal((await queue('Example Business')).total,2);
   assert.equal((await queue('%')).total,0);
   assert.equal((await queue('','registered')).total,0);
   assert.equal((await queue('','','paid')).total,0);
   assert.equal((await queue('','','',1)).orders.length,0);
   await assert.rejects(queue('','invented'),/Invalid filters/);
  });
  await t.test('admins cannot write payment fields, event history or unpaid registration progress',async()=>{
   await as(2);await assert.rejects(update('processing'),/Confirm payment/);
   await assert.rejects(db.query("update nxt_domain_orders set payment_status='paid' where id=$1",[id(20)]),/permission denied/);
   await assert.rejects(db.query('delete from nxt_domain_events'),/permission denied/);
   await assert.rejects(update('registered','','FAKE'),/Invalid status transition/);
   await assert.rejects(update('needs_attention'),/Add a reason/);
  });
  await t.test('confirmed payment stays separate from fulfilment and staff cannot forge payment confirmation',async()=>{
   await db.exec(`reset role;insert into nxt_domain_payments(order_id,customer_id,reference,msisdn,amount_cents,currency) values('${id(20)}','${id(4)}','${id(30)}','263700000000',400,'USD');set role service_role;`);
   const args=[id(20),id(4),id(30),'TEST-RECEIPT',400,'USD'];
   const result=(await db.query('select public.nxt_domain_confirm_payment($1,$2,$3,$4,$5,$6) q',args)).rows[0].q;
   assert.equal(result.payment_status,'paid');assert.equal(result.fulfilment_status,'pending');
   await as(2);await assert.rejects(db.query('select public.nxt_domain_confirm_payment($1,$2,$3,$4,$5,$6)',args),/permission denied/);
  });
  await t.test('paid order advances only with valid transitions, confirmation and optimistic concurrency',async()=>{
   await as(2);let o=await update('processing','Started registration');assert.equal(o.fulfilment_version,1);assert.equal(o.payment_status,'paid');
   await assert.rejects(update('processing','Stale edit'),/This order changed/);
   await assert.rejects(update('registered','','',1),/registrar confirmation/);
   o=await update('registered','Registrar confirmed','REG-TEST-123',1);assert.equal(o.fulfilment_version,2);assert.ok(o.registered_at);assert.equal(o.payment_reference,'TEST-RECEIPT');
   const events=(await db.query('select * from nxt_domain_events where order_id=$1 order by created_at',[id(20)])).rows;
   assert.equal(events.length,2);assert.equal(events[1].actor_label,'admin@example.test');assert.equal(events[1].registration_reference,'REG-TEST-123');
   await assert.rejects(update('pending','Reset','','2'),/Invalid status transition/);
   o=await update('registered','Follow-up completed','',2);assert.equal(o.fulfilment_version,3);
   await as(4);assert.equal((await db.query('select fulfilment_status from nxt_domain_orders')).rows[0].fulfilment_status,'registered');assert.equal((await db.query('select * from nxt_domain_events')).rows.length,0);
  });
  await t.test('cancellation needs a reason and cannot silently restart',async()=>{
   await as(1);await assert.rejects(update('cancelled','','',0,21),/Add a reason/);
   const o=await update('cancelled','Customer withdrew','',0,21);assert.equal(o.payment_status,'unpaid');
   await assert.rejects(update('processing','Restart','',1,21),/Invalid status transition/);
   assert.equal((await queue()).unpaid,0);
  });
 }finally{await db.close();}
});
