import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const t='00000000-0000-4000-8000-000000000001',k='00000000-0000-4000-8000-000000000002',n='00000000-0000-4000-8000-000000000003',other='00000000-0000-4000-8000-000000000004';
test('test invoice removal reverses once, hides client copy and protects paid/fiscal/online invoices',async()=>{
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${k}'),('${n}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.has_capability(uuid,text) returns boolean language sql stable as $$select auth.uid() in ('${k}','${n}')$$;
 create table public.accounting_reviewers(tenant_id uuid,user_id uuid);
 insert into accounting_reviewers values('${t}','${k}'),('${t}','${n}');
 create table public.business_items(id uuid primary key default gen_random_uuid(),tenant_id uuid,kind text,status text,paid numeric default 0,payload jsonb default '{}',reference text);
 alter table business_items enable row level security;grant usage on schema auth to authenticated;grant select on business_items to authenticated;create policy base_read on business_items for select to authenticated using(true);
 create table public.invoice_payments(tenant_id uuid,invoice_id uuid);
 create table public.omari_transactions(tenant_id uuid,invoice_id uuid);
 create table public.paynow_transactions(tenant_id uuid,invoice_id uuid);
 create table public.accounting_journals(id uuid primary key default gen_random_uuid(),tenant_id uuid,entry_date date,currency text,description text,lines jsonb,source_type text,source_id uuid,created_by uuid,unique(tenant_id,source_type,source_id));`);
 await db.exec(await readFile('supabase/upgrade-test-invoice-removal.sql','utf8'));
 async function invoice(status='issued',paid=0,payload={}){return (await db.query("insert into business_items(tenant_id,kind,status,paid,payload,reference) values($1,'invoice',$2,$3,$4,'TEST-1') returning id",[t,status,paid,JSON.stringify(payload)])).rows[0].id;}
 const id=await invoice();const lines=[{account:'1100',debit:100,credit:0},{account:'4000',debit:0,credit:100}];await db.query("insert into accounting_journals(tenant_id,currency,source_type,source_id,lines) values($1,'USD','Invoice issued',$2,$3)",[t,id,JSON.stringify(lines)]);
 const who=uid=>db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`),remove=id=>db.query('select remove_test_invoice($1,$2,$3)',[t,id,'Disposable test invoice']);
 await who(other);await assert.rejects(remove(id),/Only the configured/);await who(k);await remove(id);await remove(id);
 const rows=(await db.query("select lines from accounting_journals where source_type='Test invoice reversal'")).rows;assert.equal(rows.length,1);assert.deepEqual(rows[0].lines,[{account:'1100',debit:0,credit:100},{account:'4000',debit:100,credit:0}]);
 assert.equal((await db.query('select deleted_at is not null as removed,status from business_items where id=$1',[id])).rows[0].removed,true);
 await assert.rejects(db.query("update business_items set status='issued' where id=$1",[id]),/locked/);
 const paid=await invoice('paid',100);await assert.rejects(remove(paid),/payments/);
 const fiscal=await invoice('issued',0,{fiscal_receipt_id:'ABC'});await assert.rejects(remove(fiscal),/Fiscalised/);
 const online=await invoice();await db.query('insert into paynow_transactions values($1,$2)',[t,online]);await assert.rejects(remove(online),/online payment attempt/);
 await who(n);const draft=await invoice('draft');await remove(draft);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${other}',false)`);assert.equal((await db.query('select * from business_items where id=$1',[id])).rows.length,0);
 await db.close();
});
