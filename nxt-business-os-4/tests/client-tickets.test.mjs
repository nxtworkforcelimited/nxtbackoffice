import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('client tickets: switched on per client, own company only, public replies only, safe creation',async t=>{
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
await db.exec('alter table public.clients add column if not exists archived_at timestamptz');
 const sql6=await read('202611090006_tickets_deadlines_notes_client.sql'),sql7=await read('202611090007_client_support_tickets.sql');
 await db.exec(sql6);await db.exec(sql7);await db.exec(sql7); // safe to run twice
 const E=(n,e)=>`('${uuid(n)}','${e}')`;
 await db.exec(`insert into auth.users(id,email) values ${[E(1,'owner@x.test'),E(2,'mgr@x.test'),E(3,'staff@x.test'),E(4,'clienta@x.test'),E(5,'clienta2@x.test'),E(6,'clientb@x.test')].join(',')};
 insert into tenants(id,name,slug) values('${uuid(10)}','A','a');
 insert into clients(id,tenant_id,title) values('${uuid(20)}','${uuid(10)}','Client A'),('${uuid(21)}','${uuid(10)}','Client B');
 insert into memberships(tenant_id,user_id,role,client_id) values('${uuid(10)}','${uuid(1)}','owner',null),('${uuid(10)}','${uuid(2)}','staff',null),('${uuid(10)}','${uuid(3)}','staff',null),('${uuid(10)}','${uuid(4)}','client','${uuid(20)}'),('${uuid(10)}','${uuid(5)}','client','${uuid(20)}'),('${uuid(10)}','${uuid(6)}','client','${uuid(21)}');
 insert into member_permissions(tenant_id,user_id,capability) values('${uuid(10)}','${uuid(2)}','tickets');`);
 async function as(n){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uuid(n)}',false);`);}
 const T=uuid(10),mk=(c,p='Normal',title='Logo',d='Please change it')=>db.query(`select * from public.create_client_ticket('${T}','${title}','${d}','${c}','${p}')`);
 let ta,tb;

 await t.test('support is off until services are ticked',async()=>{
  await as(4);await assert.rejects(mk('Website Change'),/not switched on/);
 });
 await t.test('only the known services can be stored',async()=>{
  await db.exec('reset role');
  await assert.rejects(db.exec(`update clients set services='{website,rocket}' where id='${uuid(20)}'`),/check/i);
  await db.exec(`update clients set services='{website,email}' where id='${uuid(20)}'`);
 });
 await t.test('with services on, the client can raise tickets in the matching categories only',async()=>{
  await as(4);
  ta=(await mk('Website Bug','High')).rows[0];assert.match(ta.reference,/./);
  await mk('Email Issue');await mk('Billing Query');
  await assert.rejects(mk('Hosting / DNS'),/category/i);
  await assert.rejects(mk('Back Office Issue'),/category/i);
  await assert.rejects(mk('Website Bug','Urgent'),/urgent/i);
  await assert.rejects(mk('Website Bug','Normal','   ','x'),/title/i);
  await assert.rejects(mk('Website Bug','Normal','t','   '),/Describe/);
 });
 await t.test('a client with no services ticked (company B) still cannot',async()=>{await as(6);await assert.rejects(mk('Website Change'),/not switched on/);});
 await t.test('too many tickets in an hour are refused',async()=>{
  await as(4);await mk('Website Change');await mk('Website Change');
  await assert.rejects(mk('Website Change'),/several tickets/);
 });
 await t.test('the ticket is the client\'s, in the right workspace, New, not assigned, and deadlines are set',async()=>{
  await db.exec('reset role');
  const r=(await db.query(`select * from it_tickets where id='${ta.id}'`)).rows[0];
  assert.equal(r.client_id,uuid(20));assert.equal(r.requester_id,uuid(4));assert.equal(r.status,'New');assert.equal(r.assignee_id,null);assert.equal(r.tenant_id,T);assert.ok(r.first_response_due);
 });
 await t.test('clients cannot write into the tickets table directly',async()=>{
  await as(4);
  await assert.rejects(db.query(`insert into it_tickets(tenant_id,title,category,client_id) values('${T}','forged','Website Bug','${uuid(21)}')`),/Support Tickets page/);
 });
 await t.test('a client sees their own company\'s tickets, never another company\'s or internal ones',async()=>{
  await as(3);await db.query(`insert into it_tickets(tenant_id,title,category) values('${T}','Internal laptop','Hardware')`);
  await db.exec('reset role');await db.exec(`update clients set services='{website}' where id='${uuid(21)}'`);
  await as(6);tb=(await mk('Content Update')).rows[0];
  await as(4);
  const mine=(await db.query('select id,title from it_tickets')).rows;
  assert.ok(mine.length>=5);assert.ok(!mine.some(r=>r.id===tb.id),'not company B');assert.ok(!mine.some(r=>r.title==='Internal laptop'),'not internal');
  await as(5);assert.ok((await db.query('select 1 from it_tickets where id=$1',[ta.id])).rows.length===1,'colleague of the same company sees it');
  await as(6);assert.equal((await db.query('select 1 from it_tickets where id=$1',[ta.id])).rows.length,0);
 });
 await t.test('clients see replies and never internal notes; staff see both',async()=>{
  await as(2);
  await db.query(`insert into it_ticket_comments(tenant_id,ticket_id,body,internal,minutes) values('${T}','${ta.id}','Client keeps changing scope',true,20)`);
  await db.query(`insert into it_ticket_comments(tenant_id,ticket_id,body) values('${T}','${ta.id}','We are on it.')`);
  await as(4);assert.deepEqual((await db.query(`select body from it_ticket_comments where ticket_id='${ta.id}'`)).rows.map(r=>r.body),['We are on it.']);
  await as(6);assert.equal((await db.query(`select 1 from it_ticket_comments where ticket_id='${ta.id}'`)).rows.length,0);
  await as(2);assert.equal((await db.query(`select 1 from it_ticket_comments where ticket_id='${ta.id}'`)).rows.length,2);
 });
 await t.test('a client can reply on their company\'s open ticket only',async()=>{
  await as(5);await db.query(`select public.add_client_ticket_comment('${T}','${ta.id}','Thanks, any ETA?')`);
  await as(6);await assert.rejects(db.query(`select public.add_client_ticket_comment('${T}','${ta.id}','sneaky')`),/not found/i);
  await as(4);await assert.rejects(db.query(`select public.add_client_ticket_comment('${T}','${ta.id}','   ')`),/Write a reply/);
  await as(2);await db.exec(`update it_tickets set status='Resolved',resolution='Done' where id='${ta.id}'`);
  await as(4);await assert.rejects(db.query(`select public.add_client_ticket_comment('${T}','${ta.id}','more')`),/resolved/i);
 });
 await t.test('staff and other users cannot use the client functions',async()=>{
  await as(2);await assert.rejects(mk('Website Bug'),/Client access required/);
  await as(3);await assert.rejects(db.query(`select public.add_client_ticket_comment('${T}','${tb.id}','x')`),/Client access required/);
 });
 await t.test('a client reply alerts the managers; a manager reply emails the client without a staff name; notes email nobody',async()=>{
  await db.exec('reset role');
  const mgr=(await db.query(`select recipient,body from notification_outbox where event_key like 'it_ticket_comment:%:mgr:%'`)).rows;
  assert.equal(mgr.length,1);assert.equal(mgr[0].recipient,'mgr@x.test');assert.match(mgr[0].body,/any ETA/);
  const toClient=(await db.query(`select recipient,body from notification_outbox where event_key like 'it_ticket_comment:%' and event_key not like '%:mgr:%'`)).rows;
  assert.deepEqual(toClient.map(r=>r.recipient),['clienta@x.test']);assert.match(toClient[0].body,/We are on it/);assert.doesNotMatch(JSON.stringify(toClient),/scope|mgr@x/);
 });
});
