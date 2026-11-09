import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('password resets: owner, admin and HR staff can request; plain staff and clients cannot; owner account is owner-only',async t=>{
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

 // The capability list is widened by later migrations (hr is allowed in 202610220015); the list itself is not under test here.
 await db.exec('alter table member_permissions drop constraint if exists member_permissions_capability_check');
 await db.exec(await read('202610210007_staff_password_resets.sql'));
 await db.exec(await read('202611090002_staff_password_reset_admin_hr.sql'));
 await db.exec('create table public.staff_directory(tenant_id uuid,user_id uuid,name text)');
 const U=(n,e)=>`('${uuid(n)}','${e}')`;
 await db.exec(`insert into auth.users(id,email) values ${[U(1,'owner@x.test'),U(2,'admin@x.test'),U(3,'hr@x.test'),U(4,'staff@x.test'),U(5,'client@x.test'),U(6,'target@x.test'),U(7,'other@x.test'),U(8,'target2@x.test'),U(9,'target3@x.test')].join(',')};
 insert into tenants(id,name,slug) values('${uuid(10)}','A','a'),('${uuid(11)}','B','b');
 insert into clients(id,tenant_id,title) values('${uuid(20)}','${uuid(10)}','C');
 insert into memberships(tenant_id,user_id,role,client_id) values('${uuid(10)}','${uuid(1)}','owner',null),('${uuid(10)}','${uuid(2)}','admin',null),('${uuid(10)}','${uuid(3)}','staff',null),('${uuid(10)}','${uuid(4)}','staff',null),('${uuid(10)}','${uuid(5)}','client','${uuid(20)}'),('${uuid(10)}','${uuid(6)}','staff',null),('${uuid(10)}','${uuid(8)}','staff',null),('${uuid(10)}','${uuid(9)}','staff',null),('${uuid(11)}','${uuid(7)}','admin',null);
 insert into member_permissions(tenant_id,user_id,capability) values('${uuid(10)}','${uuid(3)}','hr');`);
 async function as(n){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uuid(n)}',false);`);}
 const reset=(t_,m)=>db.query(`select public.request_staff_password_reset('${uuid(t_)}','${uuid(m)}') r`);
 await t.test('owner can request',async()=>{await as(1);assert.equal((await reset(10,6)).rows[0].r.status,'queued');});
 await t.test('admin can request',async()=>{await as(2);assert.equal((await reset(10,8)).rows[0].r.status,'queued');});
 await t.test('staff with the HR capability can request',async()=>{await as(3);assert.equal((await reset(10,9)).rows[0].r.status,'queued');});
 await t.test('plain staff and clients cannot',async()=>{for(const n of [4,5]){await as(n);await assert.rejects(reset(10,6),/permission required/);}});
 await t.test('an admin of another workspace cannot',async()=>{await as(7);await assert.rejects(reset(10,6),/permission required/);});
 await t.test('admin and HR cannot request a reset for the owner account, the owner can',async()=>{await as(2);await assert.rejects(reset(10,1),/only the workspace owner/i);await as(3);await assert.rejects(reset(10,1),/only the workspace owner/i);await as(1);assert.equal((await reset(10,1)).rows[0].r.status,'queued');});
 await t.test('managers can read the reset history, plain staff cannot',async()=>{await as(2);assert.ok((await db.query('select * from staff_password_reset_requests')).rows.length>=3);await as(4);assert.equal((await db.query('select * from staff_password_reset_requests')).rows.length,0);});
 await t.test('the requester is re-checked when the email is prepared',async()=>{
  await db.exec('reset role');
  await db.exec(`delete from member_permissions where user_id='${uuid(3)}'`);
  const rows=(await db.query(`select id,requested_by from staff_password_reset_requests order by created_at`)).rows;
  const hrRow=rows.find(r=>r.requested_by===uuid(3));
  // claim processes oldest first; drain until the HR request is handled
  let claimed=[];for(let i=0;i<5;i++){const r=(await db.query('select public.claim_staff_password_reset() c')).rows[0].c;if(r)claimed.push(r.user_id);}
  assert.ok(!claimed.includes(uuid(9)),'request from a former HR member is not processed');
  assert.equal((await db.query(`select status from staff_password_reset_requests where id='${hrRow.id}'`)).rows[0].status,'failed');
  assert.ok(claimed.includes(uuid(6))&&claimed.includes(uuid(8)));
 });
});
