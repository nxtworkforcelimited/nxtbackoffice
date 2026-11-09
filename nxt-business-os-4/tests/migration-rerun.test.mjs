import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
// Older databases may already hold client_campaigns / sms_templates without archived_at.
test('migrations 0001 and 0004 repair older tables and can be run twice',async()=>{
 const db=new PGlite();
 await db.exec(`create role service_role;create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public,storage to authenticated;grant execute on function auth.uid() to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;`);
 const foundation=(await readFile(new URL('../supabase/migrations/202610140001_foundation.sql',import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;','');
 await db.exec(foundation);
 await db.exec(await readFile(new URL('../supabase/migrations/202610260003_cold_calling.sql',import.meta.url),'utf8'));
 await db.exec(`create table public.client_campaigns(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,client_id uuid not null,name text not null,client_visible boolean not null default false,unique(tenant_id,id));
  create table public.sms_templates(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,name text not null,body text not null,unique(tenant_id,id));`);
 const m1=await readFile(new URL('../supabase/migrations/202611090001_client_campaigns_call_conversion.sql',import.meta.url),'utf8');
 await db.exec(m1);await db.exec(m1);
 const cols=(await db.query(`select column_name from information_schema.columns where table_name='client_campaigns'`)).rows.map(r=>r.column_name);
 assert.ok(cols.includes('archived_at'));
});

test('migration 0004 keeps old sms_outbox rows with other source types and still guards new ones',async()=>{
 const db=new PGlite();
 await db.exec(`create role service_role;create role anon;create role authenticated;
 create table public.tenants(id uuid primary key);
 create table public.sms_outbox(id serial primary key,source_type text);
 insert into public.sms_outbox(source_type) values('legacy_value');`);
 const m=await readFile(new URL('../supabase/migrations/202611090004_sms_templates.sql',import.meta.url),'utf8');
 await db.exec(m);await db.exec(m);
 await db.exec(`insert into public.sms_outbox(source_type) values('template')`);
 await assert.rejects(db.exec(`insert into public.sms_outbox(source_type) values('bogus')`),/sms_outbox_source_type_check/);
 assert.equal((await db.query(`select count(*)::int n from public.sms_outbox where source_type='legacy_value'`)).rows[0].n,1);
});

test('migration 0009 adds the client portal columns, defaults off, runs twice, rejects bad values',async()=>{
 const db=new PGlite();
 await db.exec(`create table public.clients(id uuid primary key default gen_random_uuid(),title text);
  create table public.backoffice_builds(id uuid primary key default gen_random_uuid(),title text);
  insert into public.clients(title) values('Old client');insert into public.backoffice_builds(title) values('Old build');`);
 const m=await readFile(new URL('../supabase/migrations/202611090009_client_website_backoffice_portal.sql',import.meta.url),'utf8');
 await db.exec(m);await db.exec(m);
 const b=(await db.query('select client_visible,backoffice_url,integrations from public.backoffice_builds')).rows[0];
 assert.equal(b.client_visible,false);assert.equal(b.backoffice_url,'');assert.deepEqual(b.integrations,[]);
 assert.deepEqual((await db.query('select portal_features from public.clients')).rows[0].portal_features,[]);
 await db.exec(`update public.clients set portal_features='{sms}'`);
 await assert.rejects(db.exec(`update public.clients set portal_features='{rocket}'`),/clients_portal_features_check/);
 await assert.rejects(db.exec(`update public.backoffice_builds set backoffice_url='javascript:alert(1)'`),/backoffice_url_check/);
 await assert.rejects(db.exec(`update public.backoffice_builds set integrations='{"a":1}'::jsonb`),/integrations_is_array/);
});
