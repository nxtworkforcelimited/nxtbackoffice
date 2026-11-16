import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const read=f=>readFile(new URL('../'+f,import.meta.url),'utf8');
const L=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(await read('src/lib/cold-calling.ts'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('the sign-up link groups by channel, list and category and carries the Business ID',()=>{
 const u=new URL(L.signupLink({channel:'whatsapp',businessId:'IB-0123',category:'Salons & Barbers',list:'Spotly Zimbabwe'}));
 assert.equal(u.origin+u.pathname,'https://spotlyafrica.com/');
 assert.deepEqual(Object.fromEntries(u.searchParams),{utm_source:'whatsapp',utm_medium:'social',utm_campaign:'spotly-zimbabwe',utm_content:'salons-and-barbers',bid:'IB-0123'});
 const s=new URL(L.signupLink({channel:'sms',businessId:'IB-0123',category:'Salons & Barbers',list:'Spotly Zimbabwe'}));
 assert.equal(s.searchParams.get('utm_source'),'sms');assert.equal(s.searchParams.get('utm_medium'),'sms');
 assert.equal(s.searchParams.get('utm_content'),u.searchParams.get('utm_content'),'same category, same content value on every channel');
});
test('two businesses in one category share UTM values and differ only by Business ID',()=>{
 const a=new URL(L.signupLink({channel:'whatsapp',businessId:'IB-0001',category:'Gyms & Fitness',list:'Spotly Zimbabwe'})),b=new URL(L.signupLink({channel:'whatsapp',businessId:'IB-0002',category:'Gyms & Fitness',list:'Spotly Zimbabwe'}));
 for(const k of ['utm_source','utm_medium','utm_campaign','utm_content'])assert.equal(a.searchParams.get(k),b.searchParams.get(k));
 assert.notEqual(a.searchParams.get('bid'),b.searchParams.get('bid'));
});
test('the sign-up link is safe with odd input',()=>{
 assert.ok(L.signupLink({base:'javascript:alert(1)',channel:'sms',businessId:'IB-1'}).startsWith('https://spotlyafrica.com/'));
 assert.ok(L.signupLink({base:'not a url',channel:'sms',businessId:'IB-1'}).startsWith('https://spotlyafrica.com/'));
 const u=new URL(L.signupLink({channel:'whatsapp',businessId:'IB-1&x=1',category:'',list:''}));
 assert.equal(u.searchParams.get('bid'),'IB-1&x=1');assert.equal(u.searchParams.get('x'),null);
 assert.equal(u.searchParams.get('utm_content'),'uncategorised');assert.equal(u.searchParams.get('utm_campaign'),'cold-calling');
 assert.equal(L.slug('  Bars & Lounges!! ','x'),'bars-and-lounges');
});
test('the WhatsApp message names the business, the 3 free months and the link, and avoids rides',()=>{
 const m=L.whatsappMessage({contact:'Mrs Moyo',caller:'Diana',business:'La Casa',link:'https://spotlyafrica.com/?bid=IB-2'});
 for(const t of ['Hello Mrs Moyo','Diana from Spotly','La Casa','first 3 months are free','26 November','https://spotlyafrica.com/?bid=IB-2','STOP'])assert.ok(m.includes(t),t);
 assert.ok(!/ride|taxi/i.test(m));assert.ok(!/—/.test(m));
});
test('only real numbers can be dialled',()=>{
 for(const ok of ['+263 71 322 4959','0712345678','+263242700000'])assert.ok(L.canDial(ok),ok);
 for(const bad of ['Verify before visiting','Check official website','Not found in listing','',null,undefined,'12345'])assert.ok(!L.canDial(bad),String(bad));
});
test('next Business ID continues after the highest number and ignores other formats',()=>{
 assert.equal(L.nextBusinessId([]),'IB-0001');
 assert.equal(L.nextBusinessId(['IB-0001','IB-0461','',null,'JBC-9','IB-0099']),'IB-0462');
});

async function database(){
 const db=new PGlite();
 await db.exec(`create role service_role;create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public,storage to authenticated;grant execute on function auth.uid() to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;`);
 await db.exec((await read('supabase/migrations/202610140001_foundation.sql')).replace('create extension if not exists pgcrypto;',''));
 await db.exec(await read('supabase/migrations/202610260003_cold_calling.sql'));
 await db.exec(`insert into tenants(id,name,slug) values('${uuid(10)}','Tenant A','a'),('${uuid(11)}','Tenant B','b');
 insert into auth.users values('${uuid(1)}','owner@example.test');
 insert into memberships(tenant_id,user_id,role) values('${uuid(10)}','${uuid(1)}','owner');
 select set_config('request.jwt.claim.sub','${uuid(1)}',false);`);
 return db;
}
const add=(db,tenant,list,company,extra='')=>db.exec(`insert into cold_call_prospects(tenant_id,campaign,company,phone${extra?',business_id':''}) values('${uuid(tenant)}','${list}','${company}','+263 71 000 0000'${extra?`,'${extra}'`:''})`);

test('migration adds the new columns, fills blanks per list in order, and can be run twice',async()=>{
 const db=await database();
 // The live database already has some of these columns, with older rows that have no Business ID.
 await db.exec(`alter table cold_call_prospects add column business_id text, add column category text;`);
 await db.exec(`insert into cold_call_prospects(tenant_id,campaign,company,phone,business_id,created_at) values
  ('${uuid(10)}','Spotly','Imported A','+263 71 111 1111','IB-0007','2026-11-01'),
  ('${uuid(10)}','Spotly','Old blank 1','+263 71 111 1112',null,'2026-11-02'),
  ('${uuid(10)}','Spotly','Old blank 2','+263 71 111 1113','','2026-11-03'),
  ('${uuid(10)}','JBC','Other list blank','+263 71 111 1114',null,'2026-11-02'),
  ('${uuid(11)}','Spotly','Other tenant blank','+263 71 111 1115',null,'2026-11-02')`);
 const mig=await read('supabase/migrations/202611100001_cold_calling_business_ids.sql');
 await db.exec(mig);await db.exec(mig);
 const r=await db.query(`select company,business_id from cold_call_prospects order by company`);
 const m=Object.fromEntries(r.rows.map(x=>[x.company,x.business_id]));
 assert.deepEqual(m,{'Imported A':'IB-0007','Old blank 1':'IB-0008','Old blank 2':'IB-0009','Other list blank':'IB-0001','Other tenant blank':'IB-0001'});
 const cols=(await db.query(`select column_name from information_schema.columns where table_name='cold_call_prospects'`)).rows.map(x=>x.column_name);
 for(const c of ['alt_phone','message_sent_at','message_channel','archived_at','archived_by','archive_reason','business_id','category','location_address','website_source','existing_system','next_action','converted_deal_id'])assert.ok(cols.includes(c),c);
});
test('new prospects get the next Business ID, even many in one import, and keep a supplied ID',async()=>{
 const db=await database();await db.exec(await read('supabase/migrations/202611100001_cold_calling_business_ids.sql'));
 await add(db,10,'Spotly','Supplied','IB-0461');
 await db.exec(`insert into cold_call_prospects(tenant_id,campaign,company,phone) values('${uuid(10)}','Spotly','New 1','+263 71 222 0001'),('${uuid(10)}','Spotly','New 2','+263 71 222 0002'),('${uuid(10)}','Spotly','New 3','+263 71 222 0003')`);
 await add(db,10,'Fresh list','First in other list');
 await add(db,10,'Spotly','Padded','  IB-0900  ');
 const r=await db.query(`select company,business_id from cold_call_prospects order by created_at,company`);
 const m=Object.fromEntries(r.rows.map(x=>[x.company,x.business_id]));
 assert.equal(m['Supplied'],'IB-0461');
 assert.deepEqual([m['New 1'],m['New 2'],m['New 3']].sort(),['IB-0462','IB-0463','IB-0464']);
 assert.equal(m['First in other list'],'IB-0001');assert.equal(m['Padded'],'IB-0900');
});
test('removing a business is reversible and keeps its record, history and ID',async()=>{
 const db=await database();await db.exec(await read('supabase/migrations/202611100001_cold_calling_business_ids.sql'));
 await add(db,10,'Spotly','Kaguvi test');
 const id=(await db.query(`select id from cold_call_prospects`)).rows[0].id;
 await db.exec(`insert into cold_call_activities(tenant_id,prospect_id,caller_id,outcome) values('${uuid(10)}','${id}','${uuid(1)}','no_answer')`);
 await db.exec(`update cold_call_prospects set archived_at=now(),archived_by='${uuid(1)}',archive_reason='Not a real business' where id='${id}'`);
 assert.equal((await db.query(`select count(*)::int c from cold_call_prospects where archived_at is null`)).rows[0].c,0);
 assert.equal((await db.query(`select count(*)::int c from cold_call_prospects`)).rows[0].c,1);
 assert.equal((await db.query(`select count(*)::int c from cold_call_activities`)).rows[0].c,1);
 await db.exec(`update cold_call_prospects set archived_at=null,archived_by=null,archive_reason='' where id='${id}'`);
 const r=(await db.query(`select business_id,archived_at from cold_call_prospects`)).rows[0];
 assert.equal(r.business_id,'IB-0001');assert.equal(r.archived_at,null);
});
test('the API reads the alternative number, removes and restores by archiving, and never deletes',async()=>{
 const src=await read('src/app/api/calls/route.ts');
 assert.ok(/alt_phone:find\(/.test(src)&&/'alternative_number'/.test(src)&&/'alternative_contact_number'/.test(src));
 assert.ok(/action==='archive_prospect'/.test(src)&&/action==='restore_prospect'/.test(src)&&/action==='mark_message_sent'/.test(src)&&/action==='archive_list'/.test(src)&&/action==='restore_list'/.test(src));
 assert.ok(/'owner_id',\.\.\.textFields/.test(src),'the caller can be changed from the sheet');
 assert.ok(!/\.delete\(\)/.test(src),'cold calling never deletes records');
 assert.ok(/is\('archived_at',null\)/.test(src));
 assert.ok(/'alt_phone'\] as const/.test(src));
});

test('archiving and restoring a whole list touches only that client and list',async()=>{
 const db=await database();await db.exec(await read('supabase/migrations/202611100001_cold_calling_business_ids.sql'));
 await db.exec(`insert into clients(id,tenant_id,title) values('${uuid(20)}','${uuid(10)}','Client A')`);
 await db.exec(`insert into cold_call_prospects(tenant_id,campaign,company,phone,target_type,client_id) values
  ('${uuid(10)}','Kaguvi Go','K1','+263 71 000 0001','nxt',null),('${uuid(10)}','Kaguvi Go','K2','+263 71 000 0002','nxt',null),
  ('${uuid(10)}','Kaguvi Go','C1','+263 71 000 0003','client','${uuid(20)}'),('${uuid(10)}','Spotly Zimbabwe','S1','+263 71 000 0004','client','${uuid(20)}')`);
 const hide=`update cold_call_prospects set archived_at=now() where tenant_id='${uuid(10)}' and target_type='nxt' and campaign='Kaguvi Go' and client_id is null and archived_at is null`;
 await db.exec(hide);
 const live=(await db.query(`select company from cold_call_prospects where archived_at is null order by company`)).rows.map(r=>r.company);
 assert.deepEqual(live,['C1','S1'],'same list name for another client is untouched');
 await db.exec(`update cold_call_prospects set archived_at=null where tenant_id='${uuid(10)}' and target_type='nxt' and campaign='Kaguvi Go' and client_id is null and archived_at is not null`);
 assert.equal((await db.query(`select count(*)::int c from cold_call_prospects where archived_at is null`)).rows[0].c,4);
});
test('the sheet shows one client at a time, with a tab per client and uploads aimed at that client',async()=>{
 const ui=await read('src/components/cold-calling.tsx');
 assert.ok(/client-switcher/.test(ui)&&/openClient/.test(ui));
 assert.ok(!/useState\('all'\),\[campaignFilter/.test(ui),'it no longer opens on every client mixed together');
 assert.ok(/Upload CSV for /.test(ui));
 assert.ok(/lists\.filter\(l=>l\.client===clientFilter\)/.test(ui),'list tabs belong to the chosen client');
});
test('long lists are read in pages so none are cut off at 1,000 rows',async()=>{
 const src=await read('src/app/api/calls/route.ts');assert.ok(/pageProspects/.test(src)&&/range\(from,from\+999\)/.test(src));
});
