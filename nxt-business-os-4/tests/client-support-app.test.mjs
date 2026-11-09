import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const read=f=>readFile(new URL('../'+f,import.meta.url),'utf8');
const L=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(await read('src/lib/client-support.ts'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));

test('support is off with no services and on with any',()=>{
 for(const v of [undefined,null,[],'website',{}, ['rocket']])assert.equal(L.supportEnabled(v),false,JSON.stringify(v));
 assert.equal(L.supportEnabled(['email']),true);assert.deepEqual(L.cleanServices(['email','rocket','website','email']),['website','email']);
});
test('categories follow the services ticked, billing always, no duplicates',()=>{
 assert.deepEqual(L.categoriesFor([]),[]);
 assert.deepEqual(L.categoriesFor(['website']),['Website Change','Website Bug','Content Update','Billing Query']);
 assert.deepEqual(L.categoriesFor(['hosting','domain']),['Hosting / DNS','Billing Query']);
 assert.ok(L.categoriesFor(['back_office','email','other']).includes('Email Issue'));
});
test('the app and the database offer the same categories per service',async()=>{
 const sql=await read('supabase/migrations/202611090007_client_support_tickets.sql');
 assert.match(sql,/'website' then array\['Website Change','Website Bug','Content Update'\]/);
 assert.match(sql,/'back_office' then array\['Back Office Issue'\]/);assert.match(sql,/'hosting' then array\['Hosting \/ DNS'\] when 'domain' then array\['Hosting \/ DNS'\] when 'email' then array\['Email Issue'\]/);
 assert.match(sql,/else array\['Other Support Request'\]/);assert.match(sql,/array\['Billing Query'\]/);
});
test('client route: clients only, own company only, safe columns, no staff data',async()=>{
 const r=await read('src/app/api/client-tickets/route.ts');
 assert.match(r,/role!=='client'/);assert.match(r,/trustedRequest/);
 assert.match(r,/eq\('client_id',clientId\)/);assert.match(r,/eq\('internal',false\)/);
 const cols=r.match(/ticketColumns='([^']+)'/)[1].split(',');
 for(const bad of ['assignee_id','requester_id','minutes','first_response_due','resolution_due','first_response_at','requested_for_id','device_id','backoffice_id'])assert.ok(!cols.includes(bad),bad);
 assert.doesNotMatch(r,/\.insert\(|\.update\(|\.delete\(/,'writes only through the database functions');
 assert.match(r,/rpc\('create_client_ticket'/);assert.match(r,/rpc\('add_client_ticket_comment'/);
 assert.match(r,/from:x\.author_id===c\.user\.id\?'You'/,'staff names are not sent to clients');
});
test('staff can tick services; the portal shows the page only when support is on',async()=>{
 const ui=await read('src/components/operations-legacy.tsx'),d=await read('src/components/dashboard.tsx'),api=await read('src/app/api/operations/route.ts');
 assert.match(ui,/Services we look after for this client/);assert.match(api,/services:z\.array/);assert.match(api,/202611090007/);
 assert.match(d,/v==='tickets'&&clientSupportOn/);assert.match(d,/<ClientTickets/);
});
