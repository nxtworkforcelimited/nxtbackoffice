import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('client campaigns: staff manage, clients see only their own visible campaigns without internal fields',async t=>{
 const db=new PGlite();
 await db.exec(`create role service_role;create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public,storage to authenticated;grant execute on function auth.uid() to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant select,insert,delete on storage.objects to authenticated;`);
 const foundation=(await readFile(new URL('../supabase/migrations/202610140001_foundation.sql',import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;','');
 await db.exec(foundation);
 await db.exec(await readFile(new URL('../supabase/migrations/202610260003_cold_calling.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/202611090001_client_campaigns_call_conversion.sql',import.meta.url),'utf8'));
 await db.exec(`insert into auth.users values('${uuid(1)}','staff@example.test'),('${uuid(2)}','clienta@example.test'),('${uuid(3)}','clientb@example.test'),('${uuid(4)}','other@example.test');
 insert into tenants(id,name,slug) values('${uuid(10)}','Tenant A','a'),('${uuid(11)}','Tenant B','b');
 insert into clients(id,tenant_id,title) values('${uuid(20)}','${uuid(10)}','Client A'),('${uuid(21)}','${uuid(10)}','Client B'),('${uuid(22)}','${uuid(11)}','Other tenant client');
 insert into memberships(tenant_id,user_id,role,client_id) values('${uuid(10)}','${uuid(1)}','staff',null),('${uuid(10)}','${uuid(2)}','client','${uuid(20)}'),('${uuid(10)}','${uuid(3)}','client','${uuid(21)}'),('${uuid(11)}','${uuid(4)}','staff',null);`);
 async function as(n){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uuid(n)}',false);`);}
 await as(1);
 await t.test('staff can add campaigns for a client in their own workspace',async()=>{
  await db.exec(`insert into client_campaigns(tenant_id,client_id,name,client_visible,budget,internal_notes,client_summary,utm_campaign) values
   ('${uuid(10)}','${uuid(20)}','A shown',true,500,'secret margin note','Launch month','a-shown'),
   ('${uuid(10)}','${uuid(20)}','A hidden',false,100,'x','','a-hidden'),
   ('${uuid(10)}','${uuid(21)}','B shown',true,900,'y','','b-shown')`);
  assert.equal((await db.query('select * from client_campaigns')).rows.length,3);
 });
 await t.test('staff cannot create a campaign for another tenant or its client',async()=>{
  await assert.rejects(db.exec(`insert into client_campaigns(tenant_id,client_id,name) values('${uuid(11)}','${uuid(22)}','Nope')`),/row-level security/);
  await assert.rejects(db.exec(`insert into client_campaigns(tenant_id,client_id,name) values('${uuid(10)}','${uuid(22)}','Nope')`),/foreign key/);
 });
 await t.test('invalid status and date order are rejected',async()=>{
  await assert.rejects(db.exec(`insert into client_campaigns(tenant_id,client_id,name,status) values('${uuid(10)}','${uuid(20)}','x','bogus')`),/check/);
  await assert.rejects(db.exec(`insert into client_campaigns(tenant_id,client_id,name,start_date,end_date) values('${uuid(10)}','${uuid(20)}','x','2026-05-02','2026-05-01')`),/check/);
 });
 await t.test('a client cannot read the table directly',async()=>{
  await as(2);
  assert.equal((await db.query('select * from client_campaigns')).rows.length,0);
 });
 await t.test('a client sees only their own visible campaigns and no budget or internal notes',async()=>{
  await as(2);
  const r=await db.query(`select * from client_visible_campaigns('${uuid(10)}')`);
  assert.deepEqual(r.rows.map(x=>x.name),['A shown']);
  assert.equal('budget' in r.rows[0],false);assert.equal('internal_notes' in r.rows[0],false);
  await as(3);
  assert.deepEqual((await db.query(`select name from client_visible_campaigns('${uuid(10)}')`)).rows.map(x=>x.name),['B shown']);
 });
 await t.test('a client cannot write campaigns',async()=>{
  await as(2);
  await assert.rejects(db.exec(`insert into client_campaigns(tenant_id,client_id,name) values('${uuid(10)}','${uuid(20)}','Self made')`),/row-level security/);
  await db.exec(`update client_campaigns set name='Hacked'`);
  await as(1);
  assert.equal((await db.query(`select * from client_campaigns where name='Hacked'`)).rows.length,0);
 });
 await t.test('staff in another workspace see nothing and cannot use the client function',async()=>{
  await as(4);
  assert.equal((await db.query('select * from client_campaigns')).rows.length,0);
  assert.equal((await db.query(`select * from client_visible_campaigns('${uuid(10)}')`)).rows.length,0);
 });
 await t.test('campaigns cannot be deleted by anyone through the app role',async()=>{
  await as(1);
  await assert.rejects(db.exec('delete from client_campaigns'),/permission denied/);
 });
 await t.test('prospect conversion link exists and existing prospects are untouched',async()=>{
  await as(1);
  await db.exec(`insert into cold_call_prospects(tenant_id,company,phone) values('${uuid(10)}','Acme','+263771234567')`);
  const r=await db.query('select converted_deal_id,converted_at from cold_call_prospects');
  assert.deepEqual(r.rows,[{converted_deal_id:null,converted_at:null}]);
 });
});
