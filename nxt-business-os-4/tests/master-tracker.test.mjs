import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/lib/server/master-tracker.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {masterTrackerResponse,normalizeSnapshot}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const ctx=(role,id='tenant-a')=>({user:{id:'test-user'},workspace:{id,role}});
const config={workspaceId:'tenant-a',sitesToken:'test-platform-token',feedSecret:'test-feed-secret'};
const fixture=()=>({version:1,checkedAt:'2026-10-22T14:00:00.000Z',complete:true,projects:['packeasy','kavir','cyber'].map(id=>({id,name:id,available:true,data:{tasks:[{id:'SAME',title:'Live task',status:'In progress',owner:'Alex',checks:[{text:'Review',done:false}],internalSecret:'hidden'}],approvals:[{id:'A1',title:'Review approval',approver:'Reviewer',target:'2026-10-23'}],risks:[{id:'R1',risk:'Delivery risk',mitigation:'Confirm owner'}],files:[{secret:'file-private'}]}}))});
test('anonymous, client, unknown roles, wrong workspace and missing membership are denied before contacting the feed',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('must not run');};
 for(const state of [null,{user:{id:'test-user'}},ctx('client'),ctx('viewer'),ctx('staff','tenant-b')]){
  const response=await masterTrackerResponse('tenant-a',async()=>state,config,fetcher);assert.ok([401,403].includes(response.status));assert.equal(response.headers.get('cache-control'),'private, no-store');assert.ok(!(await response.text()).includes('Live task'));
 }
 assert.equal(calls,0);
 assert.equal((await masterTrackerResponse('other-tenant',async()=>ctx('owner','other-tenant'),config,fetcher)).status,403);assert.equal(calls,0);
});
test('verified owner/admin/staff fetch the fixed read-only source with server-only credentials and no redirects or caching',async()=>{
 for(const role of ['owner','admin','staff']){
  const response=await masterTrackerResponse('tenant-a',async()=>ctx(role),config,async(url,init)=>{
   assert.equal(url,'https://nxt-managing-director-master-tracker.hello153826.chatgpt.site/api/business-os-feed');assert.equal(init.headers['X-Business-OS-Workspace'],'tenant-a');assert.equal(init.headers['X-Business-OS-Feed-Secret'],config.feedSecret);assert.equal(init.headers['OAI-Sites-Authorization'],'Bearer '+config.sitesToken);assert.equal(init.redirect,'manual');assert.equal(init.cache,'no-store');return Response.json(fixture());
  });
  assert.equal(response.status,200);assert.equal(response.headers.get('vary'),'Cookie');const data=await response.json();assert.equal(data.projects.length,3);assert.equal(data.projects[0].data.approvals[0].owner,'Reviewer');assert.equal(data.projects[0].data.risks[0].title,'Delivery risk');assert.ok(!JSON.stringify(data).includes('internalSecret'));assert.ok(!JSON.stringify(data).includes('file-private'));assert.ok(!JSON.stringify(data).includes('test-platform-token'));
 }
});
test('each request reads current upstream values and keeps project-scoped identical record IDs',async()=>{
 let title='Before';const fetcher=async()=>{const data=fixture();data.projects[0].data.tasks[0].title=title;return Response.json(data);};
 const first=await(await masterTrackerResponse('tenant-a',async()=>ctx('staff'),config,fetcher)).json();title='After';const second=await(await masterTrackerResponse('tenant-a',async()=>ctx('staff'),config,fetcher)).json();assert.equal(first.projects[0].data.tasks[0].title,'Before');assert.equal(second.projects[0].data.tasks[0].title,'After');assert.equal(second.projects[1].data.tasks[0].id,'SAME');
});
test('partial failures remain unavailable and totals are never reported complete',()=>{
 const value=fixture();value.projects[1]={id:'kavir',available:false,error:'private diagnostic'};value.complete=true;const data=normalizeSnapshot(value);assert.equal(data.complete,false);assert.equal(data.projects[1].data,undefined);assert.ok(!JSON.stringify(data).includes('private diagnostic'));
});
test('upstream redirects, invalid payloads and failures fail closed without disclosing service diagnostics',async()=>{
 for(const fetcher of [async()=>new Response(null,{status:302,headers:{Location:'https://other.example'}}),async()=>Response.json({projects:[]}),async()=>new Response('Login',{headers:{'content-type':'text/html'}}),async()=>{throw Error('test-platform-token private diagnostic');}]){
  const response=await masterTrackerResponse('tenant-a',async()=>ctx('owner'),config,fetcher);assert.equal(response.status,502);assert.ok(!(await response.text()).includes('private diagnostic'));
 }
 const bad=fixture();bad.projects[0].data.tasks.push({...bad.projects[0].data.tasks[0]});assert.throws(()=>normalizeSnapshot(bad));
});
test('membership revocation prevents subsequent access; absent configuration and auth outages fail closed',async()=>{
 const response=await masterTrackerResponse('tenant-a',async()=>ctx('client'),config,async()=>{throw Error('must not run');});assert.equal(response.status,403);
 assert.equal((await masterTrackerResponse('tenant-a',async()=>ctx('staff'),{workspaceId:'tenant-a'})).status,503);
 assert.equal((await masterTrackerResponse('tenant-a',async()=>{throw Error('auth outage');},config)).status,503);
 assert.equal((await masterTrackerResponse(null,async()=>{throw Error('must not run');},config)).status,400);
});

test('write gateway denies clients and other tenants before upstream calls',async()=>{const {masterTrackerWrite}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));let calls=0;for(const state of [null,ctx('client'),ctx('viewer'),ctx('owner','other')]){const r=await masterTrackerWrite('tenant-a',{project:'kavir',action:'update'},async()=>state,{...config,writeSecret:'write'},async()=>{calls++;throw Error();});assert.ok([401,403].includes(r.status));}assert.equal(calls,0);});
test('write gateway uses verified email and fixed destination; forwards conflict without exposing secrets',async()=>{const {masterTrackerWrite}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));const current={...ctx('staff'),user:{id:'verified',email:'bridget@nxt-workforce.com'}};const response=await masterTrackerWrite('tenant-a',{project:'kavir',action:'update',actor:{email:'michael@nxt-workforce.com'},url:'https://evil.example',kind:'tasks',id:'T1',version:2,changes:{notes:'test'},requestId:'operation-test-001'},async()=>current,{...config,writeSecret:'separate-write-key'},async(url,init)=>{assert.equal(url,'https://nxt-managing-director-master-tracker.hello153826.chatgpt.site/api/business-os-write');const b=JSON.parse(init.body);assert.deepEqual(b.actor,{userId:'verified',email:'bridget@nxt-workforce.com'});assert.equal(b.url,undefined);assert.equal(init.headers['X-Business-OS-Write-Secret'],'separate-write-key');return Response.json({detail:'This record has a newer version.'},{status:409});});assert.equal(response.status,409);assert.match((await response.json()).error,/newer version/);});
