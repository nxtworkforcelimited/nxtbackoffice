import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const load=async f=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(await readFile(new URL('../src/lib/'+f,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const L=await load('sms-templates.ts');
const route=await readFile(new URL('../src/app/api/sms/route.ts',import.meta.url),'utf8');
const sql=await readFile(new URL('../supabase/migrations/202611090004_sms_templates.sql',import.meta.url),'utf8');

test('merge fields are filled and unfilled ones stay visible',()=>{
 const t='Hi {client_name}, invoice {invoice_number} for {amount}. - {company}';
 assert.equal(L.renderTemplate(t,{client_name:'Acme',invoice_number:'INV-1',amount:'USD 10.00',company:'NXT'}),'Hi Acme, invoice INV-1 for USD 10.00. - NXT');
 assert.equal(L.renderTemplate(t,{client_name:'Acme'}),'Hi Acme, invoice {invoice_number} for {amount}. - {company}');
 assert.deepEqual(L.missingFields(t,{client_name:'Acme',company:'NXT'}),['invoice_number','amount']);
});
test('typos in field names are caught, not sent',()=>{
 assert.deepEqual(L.unknownFields('Hello {clientname} and {client_name}'),['clientname']);
 assert.equal(L.renderTemplate('Hi {clientname}',{client_name:'A'}),'Hi {clientname}');
});
test('every starter template only uses real fields',()=>{
 for(const s of L.starterTemplates){assert.deepEqual(L.unknownFields(s.body),[],s.name);assert.ok(s.body.length<=480,s.name);assert.ok(L.smsSegments(L.renderTemplate(s.body,L.sampleValues())).segments<=2,s.name+' too long');}
});
test('SMS length counts 160 per message, 70 with special characters',()=>{
 assert.deepEqual(L.smsSegments('a'.repeat(160)),{length:160,unicode:false,segments:1});
 assert.equal(L.smsSegments('a'.repeat(161)).segments,2);
 assert.equal(L.smsSegments('a'.repeat(307)).segments,3);
 assert.equal(L.smsSegments('Thanks 😀').unicode,true);
 assert.equal(L.smsSegments('').segments,0);
});
test('money, dates and receipt numbers read cleanly',()=>{
 assert.equal(L.money('USD',450),'USD 450.00');assert.equal(L.money(null,'12.5'),'USD 12.50');
 assert.equal(L.dueDateText('2026-11-15'),'15 Nov 2026');assert.equal(L.dueDateText(null),'');
 assert.equal(L.shortReceipt('3f9a12bc-1111-2222-3333-444455556666'),'RCT-3F9A12BC');
});
test('night hours in Harare are 8pm to 7am',()=>{
 assert.equal(L.isQuietHour(new Date('2026-11-09T18:00:00Z')),true);  // 20:00 CAT
 assert.equal(L.isQuietHour(new Date('2026-11-09T17:59:00Z')),false); // 19:59 CAT
 assert.equal(L.isQuietHour(new Date('2026-11-09T04:59:00Z')),true);  // 06:59 CAT
 assert.equal(L.isQuietHour(new Date('2026-11-09T05:00:00Z')),false); // 07:00 CAT
});
test('route: staff with SMS access only, own workspace only, no client trust',()=>{
 assert.match(route,/role==='client'/);
 assert.equal((route.match(/allowed\(c\.workspace\.role,c\.workspace\.permissions\?\?\[\],'sms'\)/g)||[]).length,2);
 assert.match(route,/trustedRequest\(req\)/);
 assert.ok((route.match(/\.eq\('tenant_id',/g)||[]).length>=10,'every query is scoped to the workspace');
 assert.doesNotMatch(route,/\.delete\(\)/,'templates are archived, never deleted');
});
test('route: server fills details, blocks leftovers, duplicates and night sends',()=>{
 assert.match(route,/renderTemplate\(p\.data\.message,values\)/);
 assert.match(route,/still has \{/);
 assert.match(route,/already sent to this number today/);
 assert.match(route,/isQuietHour\(\)&&!p\.data\.allow_night/);
 assert.match(route,/belongs to a different client/);
});
test('migration: additive, no browser access, keeps old source types',()=>{
 assert.doesNotMatch(sql,/drop table|truncate|delete from/i);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.sms_templates from anon,authenticated/);
 for(const v of ['task','project','social_post','manual_test','manual','template'])assert.match(sql,new RegExp("'"+v+"'"));
});
