import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('tickets upgrade: deadlines, internal notes, replies, manager alerts, categories, client link',async t=>{
 const db=new PGlite();
 await db.exec(`create role service_role;create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,deleted_at timestamptz,email_confirmed_at timestamptz default now(),banned_until timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public,storage to authenticated;grant execute on function auth.uid() to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;`);
 const read=f=>readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8');
 await db.exec((await read('202610140001_foundation.sql')).replace('create extension if not exists pgcrypto;',''));
 await db.exec(await read('202610160001_business_workspace.sql'));
 await db.exec('alter table member_permissions drop constraint if exists member_permissions_capability_check');
 // The ticket tables as the repo defines them, with the old category list, plus the outbox the earlier migrations extend.
 await db.exec(`create table public.notification_outbox(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),recipient text not null,subject text not null,body text not null,created_at timestamptz not null default now(),sent_at timestamptz,attempts integer not null default 0,last_error text);
 create table public.staff_directory(tenant_id uuid,user_id uuid,name text,primary key(tenant_id,user_id));
 create table public.it_tickets(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,requester_id uuid not null default auth.uid(),assignee_id uuid,reference text not null default ('IT-'||upper(substr(gen_random_uuid()::text,1,8))),title text not null,description text not null default 'x',device text not null default '',category text not null check(category in ('Hardware','Software','Network','Account access','Other')),priority text not null default 'Normal' check(priority in ('Low','Normal','High','Urgent')),status text not null default 'New' check(status in ('New','Assigned','In progress','Waiting','Resolved','Closed')),resolution text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(tenant_id,id),unique(tenant_id,reference));
 create table public.it_ticket_comments(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,ticket_id uuid not null,author_id uuid not null default auth.uid(),body text not null,created_at timestamptz not null default now(),foreign key(tenant_id,ticket_id) references public.it_tickets(tenant_id,id));
 alter table public.notification_outbox add column source_type text,add column source_id uuid,add column event_key text;
 create unique index on public.notification_outbox(event_key) where event_key is not null;
 alter table public.it_tickets enable row level security;alter table public.it_ticket_comments enable row level security;
 create policy ticket_read on public.it_tickets for select to authenticated using(requester_id=(select auth.uid()) or public.has_capability(tenant_id,'tickets'));
 create policy ticket_create on public.it_tickets for insert to authenticated with check(requester_id=(select auth.uid()));
 create policy ticket_manage on public.it_tickets for update to authenticated using(public.has_capability(tenant_id,'tickets')) with check(public.has_capability(tenant_id,'tickets'));
 grant select,insert,update on public.it_tickets to authenticated;grant select,insert on public.it_ticket_comments to authenticated;grant select on public.clients,public.staff_directory,public.notification_outbox to authenticated;`);
 const sql=await read('202611090006_tickets_deadlines_notes_client.sql');
 await db.exec(sql);await db.exec(sql); // safe to run twice

 const E=(n,e)=>`('${uuid(n)}','${e}')`;
 await db.exec(`insert into auth.users(id,email) values ${[E(1,'owner@x.test'),E(2,'mgr@x.test'),E(3,'staff@x.test'),E(4,'adrian@nxt-workforce.com'),E(5,'mgr2@x.test'),E(6,'other@x.test')].join(',')};
 insert into tenants(id,name,slug) values('${uuid(10)}','A','a'),('${uuid(11)}','B','b');
 insert into clients(id,tenant_id,title) values('${uuid(20)}','${uuid(10)}','Client A'),('${uuid(21)}','${uuid(11)}','Client B');
 insert into memberships(tenant_id,user_id,role,client_id) values('${uuid(10)}','${uuid(1)}','owner',null),('${uuid(10)}','${uuid(2)}','staff',null),('${uuid(10)}','${uuid(3)}','staff',null),('${uuid(10)}','${uuid(4)}','staff',null),('${uuid(10)}','${uuid(5)}','staff',null),('${uuid(11)}','${uuid(6)}','owner',null);
 insert into member_permissions(tenant_id,user_id,capability) values('${uuid(10)}','${uuid(2)}','tickets'),('${uuid(10)}','${uuid(4)}','tickets'),('${uuid(10)}','${uuid(5)}','tickets');`);
 async function as(n){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uuid(n)}',false);`);}
 const hours=async(id,col)=>Number((await db.query(`select round(extract(epoch from ${col}-created_at)/3600) h from it_tickets where id='${id}'`)).rows[0].h);
 let a,b;

 await t.test('deadlines are set from priority and recalculated when priority changes',async()=>{
  await as(3);
  a=(await db.query(`insert into it_tickets(tenant_id,title,category,priority) values('${uuid(10)}','Site down','Website Bug','Urgent') returning id`)).rows[0].id;
  b=(await db.query(`insert into it_tickets(tenant_id,title,category,client_id) values('${uuid(10)}','Change logo','Website Change','${uuid(20)}') returning id`)).rows[0].id;
  assert.deepEqual([await hours(a,'first_response_due'),await hours(a,'resolution_due')],[1,4]);
  assert.deepEqual([await hours(b,'first_response_due'),await hours(b,'resolution_due')],[8,72]);
  await as(2);await db.exec(`update it_tickets set priority='Low' where id='${b}'`);
  assert.deepEqual([await hours(b,'first_response_due'),await hours(b,'resolution_due')],[24,168]);
 });
 await t.test('new categories work, unknown ones and other-workspace clients do not',async()=>{
  await as(3);
  for(const c of ['Content Update','Hosting / DNS','Billing Query','Hardware','General IT'])await db.query(`insert into it_tickets(tenant_id,title,category) values('${uuid(10)}','x','${c}')`);
  await assert.rejects(db.query(`insert into it_tickets(tenant_id,title,category) values('${uuid(10)}','x','Bogus')`),/check/i);
  await assert.rejects(db.query(`insert into it_tickets(tenant_id,title,category,client_id) values('${uuid(10)}','x','Other','${uuid(21)}')`),/foreign key|violates/i);
 });
 await t.test('moving a ticket out of New records the first response',async()=>{
  await as(2);await db.exec(`update it_tickets set status='Assigned' where id='${a}'`);
  await db.exec('reset role');assert.ok((await db.query(`select first_response_at from it_tickets where id='${a}'`)).rows[0].first_response_at);
 });
 await t.test('internal notes: managers write and read them, the requester neither',async()=>{
  await as(2);
  await db.query(`insert into it_ticket_comments(tenant_id,ticket_id,body,internal,minutes) values('${uuid(10)}','${b}','Customer is difficult, check hosting first',true,15)`);
  await as(3);
  await assert.rejects(db.query(`insert into it_ticket_comments(tenant_id,ticket_id,body,internal) values('${uuid(10)}','${b}','sneaky note',true)`),/row-level security/i);
  await assert.rejects(db.query(`insert into it_ticket_comments(tenant_id,ticket_id,body,minutes) values('${uuid(10)}','${b}','sneaky time',30)`),/row-level security/i);
  await db.query(`insert into it_ticket_comments(tenant_id,ticket_id,body) values('${uuid(10)}','${b}','Any news?')`);
  assert.deepEqual((await db.query(`select body from it_ticket_comments where ticket_id='${b}'`)).rows.map(r=>r.body),['Any news?']);
  await as(5);assert.equal((await db.query(`select 1 from it_ticket_comments where ticket_id='${b}'`)).rows.length,2);
  await as(6);assert.equal((await db.query(`select 1 from it_ticket_comments`)).rows.length,0,'another workspace sees nothing');
 });
 await t.test('a manager reply is emailed once to the requester and counts as the first response; notes and own comments do not email',async()=>{
  await db.exec('reset role');
  assert.equal((await db.query(`select 1 from notification_outbox where event_key like 'it_ticket_comment:%'`)).rows.length,0);
  await as(5);await db.query(`insert into it_ticket_comments(tenant_id,ticket_id,body) values('${uuid(10)}','${b}','We have updated the logo.')`);
  await db.exec('reset role');
  const out=(await db.query(`select recipient,subject,body from notification_outbox where event_key like 'it_ticket_comment:%'`)).rows;
  assert.equal(out.length,1);assert.equal(out[0].recipient,'staff@x.test');assert.match(out[0].body,/updated the logo/);
  assert.ok((await db.query(`select first_response_at from it_tickets where id='${b}'`)).rows[0].first_response_at);
  assert.doesNotMatch(JSON.stringify(out),/difficult/,'internal note never leaves');
 });
 await t.test('new tickets alert every other ticket manager once, not the requester or the fixed address',async()=>{
  await db.exec('reset role');
  const rows=(await db.query(`select recipient from notification_outbox where event_key like 'it_ticket:${a}:created:manager:%'`)).rows.map(r=>r.recipient).sort();
  assert.deepEqual(rows,['mgr2@x.test','mgr@x.test']);
 });
});
