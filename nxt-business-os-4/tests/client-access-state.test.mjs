import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('client access status is owner-only, tenant-scoped and never exposes a password hash',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema nxt_private;grant usage on schema public,auth,nxt_private to authenticated;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz,encrypted_password text,banned_until timestamptz);
 create table public.clients(id uuid primary key,tenant_id uuid,email text);
 create table public.memberships(tenant_id uuid,user_id uuid,client_id uuid,role text);
 create table public.client_invitations(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.workspace_role_for(t uuid) returns text language sql stable security definer set search_path='' as $$select role from public.memberships where tenant_id=t and user_id=auth.uid() limit 1$$;
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,last_sign_in_at) values('${id(1)}','owner@test.invalid',null,now(),now()),('${id(2)}','client@test.invalid',null,now(),now()),('${id(3)}','staff@test.invalid',null,now(),null),('${id(4)}','other@test.invalid',null,now(),null);
 insert into public.clients values('${id(20)}','${id(10)}','client@test.invalid'),('${id(21)}','${id(11)}','other@test.invalid');
 insert into public.memberships values('${id(10)}','${id(1)}',null,'owner'),('${id(10)}','${id(2)}','${id(20)}','client'),('${id(10)}','${id(3)}',null,'staff'),('${id(11)}','${id(4)}',null,'owner');`);
 await db.exec(await readFile(new URL('../supabase/migrations/202610210001_client_access_status.sql',import.meta.url),'utf8'));
 const as=async n=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false);`);
 const state=()=>db.query('select public.client_portal_state($1,$2) as s',[id(10),id(20)]);
 await as(1);let s=(await state()).rows[0].s;assert.equal(s.linked,true);assert.equal(s.password_set,false);assert.equal(s.email_confirmed,true);
 await db.exec(`reset role;update auth.users set encrypted_password='synthetic-hash-not-a-real-secret' where id='${id(2)}';`);
 await as(1);s=(await state()).rows[0].s;assert.equal(s.password_set,true);assert.ok(!JSON.stringify(s).includes('synthetic-hash'));assert.ok(!Object.hasOwn(s,'encrypted_password'));
 await assert.rejects(db.query('select public.client_portal_state($1,$2)',[id(10),id(21)]),/not found/i);
 for(const n of [2,3,4]){await as(n);await assert.rejects(state(),/Only the workspace owner/);}
 await db.exec('reset role;set role anon;');await assert.rejects(state(),/permission denied/);
 }finally{await db.close();}
});
test('password pages preserve same-origin form submission without sending referrers cross-site',async()=>{for(const p of ['accept','setup']){const s=await readFile(new URL('../src/app/auth/'+p+'/page.tsx',import.meta.url),'utf8');assert.match(s,/referrer:'same-origin'/);assert.ok(!s.includes("referrer:'no-referrer'"));}});
