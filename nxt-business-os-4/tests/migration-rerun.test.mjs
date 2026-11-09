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
