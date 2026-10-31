import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import ts from 'typescript';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('website intake is idempotent, business-bound, rate limited and CRM-only',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create table tenants(id uuid primary key);create table clients(tenant_id uuid,id uuid,primary key(tenant_id,id));
   create function public.has_capability(t uuid,c text) returns boolean language sql stable as $$select t::text=current_setting('app.tenant',true) and current_setting('app.crm',true)='yes'$$;
   grant usage on schema public to authenticated,anon,service_role;`);
  await db.exec(await readFile(new URL('../supabase/migrations/202610280001_website_leads.sql',import.meta.url),'utf8'));
  await db.exec(`insert into tenants values('${uuid(1)}'),('${uuid(2)}');insert into clients values('${uuid(1)}','${uuid(3)}'),('${uuid(2)}','${uuid(4)}');insert into website_lead_forms values('kaguvigo','${uuid(1)}','${uuid(3)}','KaguviGo',true);set role service_role;`);
  const capture=(email='test@example.invalid',bucket='a'.repeat(64))=>db.query('select capture_website_lead($1,$2,$3,$4,$5,$6) as ok',['kaguvigo','Test Person','+263771234567',email,'seller',bucket]);
  assert.equal((await capture()).rows[0].ok,true);
  await capture('TEST@example.invalid');
  const rows=(await db.query('select * from website_leads')).rows;assert.equal(rows.length,1);assert.equal(rows[0].tenant_id,uuid(1));assert.equal(rows[0].client_id,uuid(3));assert.equal(rows[0].interest,'seller');assert.equal(rows[0].excel_synced_at,null);
  for(let i=0;i<10;i++)assert.equal((await capture()).rows[0].ok,true);
  assert.equal((await capture('blocked@example.invalid')).rows[0].ok,false);
  assert.equal((await db.query('select count(*)::int as n from website_leads')).rows[0].n,1);
  await db.exec('reset role;set role anon;');
  await assert.rejects(db.query('select * from website_leads'),/permission denied/);await assert.rejects(capture(),/permission denied/);
  await db.exec(`reset role;set role authenticated;select set_config('app.tenant','${uuid(2)}',false),set_config('app.crm','yes',false);`);
  assert.equal((await db.query('select * from website_leads')).rows.length,0);
  await db.exec(`select set_config('app.tenant','${uuid(1)}',false),set_config('app.crm','no',false);`);
  assert.equal((await db.query('select * from website_leads')).rows.length,0);
  await db.exec("select set_config('app.crm','yes',false);");
  assert.equal((await db.query('select * from website_leads')).rows.length,1);
  await db.exec("update website_leads set status='contacted',notes='Called';");
  await assert.rejects(db.exec("update website_leads set email='overwritten@example.invalid'"),/permission denied/);
  await assert.rejects(db.exec('update website_leads set excel_synced_at=now()'),/permission denied/);
  await assert.rejects(capture(),/permission denied/);
 }finally{await db.close();}
});
async function loadTs(path){const source=await readFile(new URL(path,import.meta.url),'utf8');const out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('exports',out)(exports);return exports;}
test('signup validates consent, contacts, honeypot and streamed request size',async()=>{
 const {validateSignup,readSmallJson}=await loadTs('../src/lib/kaguvi-signup.ts');
 const valid={name:'Test Person',phone:'+263 77 123 4567',email:'TEST@example.invalid',consent:true};
 assert.equal(validateSignup(valid).data.email,'test@example.invalid');
 assert.ok(validateSignup({...valid,consent:false}).error);
 assert.ok(validateSignup({...valid,phone:'call-me'}).error);
 assert.ok(validateSignup({...valid,email:'not-an-email'}).error);
 assert.equal(validateSignup({...valid,website:'spam'}).spam,true);
 await assert.rejects(readSmallJson(new Request('https://example.invalid',{method:'POST',body:'x'.repeat(8193)})),/too_large/);
});
test('Excel export neutralizes formulas and preserves CSV escaping',async()=>{
 const {leadCsv,spreadsheetText}=await loadTs('../src/lib/lead-export.ts');
 for(const v of ['=1+1','+263771234567','@SUM(A1)',' -1','\tformula'])assert.ok(spreadsheetText(v).startsWith("'"));
 assert.ok(leadCsv([{name:'Jane, "Doe"',email:'a@example.invalid'}]).includes('"Jane, ""Doe"""'));
});
