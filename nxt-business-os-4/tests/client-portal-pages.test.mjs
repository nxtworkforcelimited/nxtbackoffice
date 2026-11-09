import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const read=f=>readFile(new URL('../'+f,import.meta.url),'utf8');
const load=async f=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(await read(f),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const S=await load('src/lib/client-sites.ts');
const P=await load('src/lib/client-support.ts');

const row={id:'b1',tenant_id:'t',client_id:'c',title:'Acme site',description:'INTERNAL scope',review_notes:'INTERNAL feedback',assignee_ids:['u1'],assignee_id:'u1',
 tasks:[{label:'SECRET task'}],site_check:{checks:[]},status:'Testing failed',url:'https://acme.example',prototype_url:'javascript:alert(1)',backoffice_url:'https://app.acme.example/login',
 build_types:['Website','Back Office','Other'],checklist:[{done:true},{done:true},{done:false},{done:false}],hosting_managed:true,dns_managed:false,client_review_status:'Awaiting review',
 target_date:'2026-12-01',integrations:[{name:' SMS ',status:'connected',note:'texts'},{name:'',status:'x'},{name:'Odd',status:'weird'}]};

test('only safe fields reach a client, with no internal notes, tasks or staff',()=>{
 const out=S.toClientBuild(row),json=JSON.stringify(out);
 assert.deepEqual(Object.keys(out).sort(),['backoffice_url','client_review','dns_managed','hosting_managed','id','integrations','preview_url','progress','stage','target_date','title','types','website_url']);
 for(const secret of ['INTERNAL','SECRET','u1','tenant','site_check'])assert.ok(!json.includes(secret),secret);
});
test('stage is plain English, progress is a percentage, bad links are dropped',()=>{
 const out=S.toClientBuild(row);
 assert.equal(out.stage,'Final checks');assert.equal(out.progress,50);assert.deepEqual(out.types,['Website','Back Office']);
 assert.equal(out.preview_url,'');assert.equal(out.website_url,'https://acme.example/');
 assert.equal(S.clientStage('Not started',false),'Planning');assert.equal(S.clientStage('In progress',false),'Being built');
 assert.equal(S.clientStage('Testing passed',true),'Live');assert.equal(S.clientStage('Testing passed',false),'Ready');
 assert.equal(S.safeLink('ftp://x.example'),'');assert.equal(S.safeLink('data:text/html,hi'),'');assert.equal(S.safeLink(''),'');
 assert.equal(S.toClientBuild({id:'x',title:'t',checklist:[]}).progress,0);
});
test('integrations are cleaned: name required, unknown status becomes planned, capped at 20',()=>{
 const out=S.cleanIntegrations(row.integrations);
 assert.deepEqual(out,[{name:'SMS',status:'connected',note:'texts'},{name:'Odd',status:'planned',note:''}]);
 assert.equal(S.cleanIntegrations(Array.from({length:40},(_,i)=>({name:'n'+i,status:'connected'}))).length,20);
 assert.deepEqual(S.cleanIntegrations('nope'),[]);
});
test('portal access is off until NXT ticks it',()=>{
 assert.deepEqual(P.portalAccess([],[]),{support:false,website:false,back_office:false,sms:false});
 assert.deepEqual(P.portalAccess(undefined,null),{support:false,website:false,back_office:false,sms:false});
 assert.deepEqual(P.portalAccess(['website','email'],['sms','rocket']),{support:true,website:true,back_office:false,sms:true});
 assert.deepEqual(P.cleanFeatures(['sms','x','sms']),['sms']);
});
test('the server only shows a client their own visible builds',async()=>{
 const api=await read('src/app/api/client-builds/route.ts'),portal=await read('src/app/api/client-portal/route.ts');
 assert.match(api,/role!=='client'\|\|!c\.workspace\.client_id/);
 assert.match(api,/\.eq\('client_id',c\.workspace\.client_id\)/);assert.match(api,/\.eq\('client_visible',true\)/);assert.match(api,/is\('archived_at',null\)/);
 assert.ok(!/searchParams\.get\('client/.test(api),'client id must never come from the request');
 assert.match(api,/toClientBuild/);assert.match(portal,/role!=='client'/);
});
test('staff switch builds on per build; default is off; column upgrade is additive',async()=>{
 const m=await read('supabase/migrations/202611090009_client_website_backoffice_portal.sql'),b=await read('src/app/api/builds/route.ts'),ui=await read('src/components/builds.tsx');
 assert.match(m,/client_visible boolean not null default false/);assert.match(m,/portal_features text\[\] not null default '\{\}'/);
 assert.ok(!/drop table|delete from|truncate/i.test(m));
 assert.match(b,/client_visible:z\.boolean\(\)\.default\(false\)/);assert.match(b,/202611090009/);
 assert.match(ui,/Show this build on the client's portal/);assert.match(ui,/Add integration/);
});
test('Tasks and Messages need the SMS tick; the new pages need their service; staff never get the client pages',async()=>{
 const d=await read('src/components/dashboard.tsx');
 assert.match(d,/\['tasks','messages'\]\.includes\(v\)&&!clientSmsOn/);
 assert.match(d,/v==='my_site'&&clientSiteOn/);assert.match(d,/v==='my_backoffice'&&clientBackOn/);
 assert.match(d,/\['my_site','my_backoffice'\]\.includes\(v\)\?false/);
 assert.match(d,/\(!client\|\|clientSmsOn\)&&<aside className="nxt-hero-quick-tasks"/);
 assert.match(d,/const greeting=!localNow\?'Welcome'/);assert.match(d,/COMING JANUARY 2027/);assert.match(d,/client&&<section className="nxt-os-banner"/);
});
