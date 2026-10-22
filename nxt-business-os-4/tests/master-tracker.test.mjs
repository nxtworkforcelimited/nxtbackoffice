import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/lib/server/master-tracker.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {masterTrackerResponse}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const ctx=(role,id='tenant-a')=>({user:{id:'test-user'},workspace:{id,role}});
test('Master Tracker denies anonymous, client, unknown roles, missing and mismatched membership without revealing catalog',async()=>{
 for(const state of [null,{user:{id:'test-user'}},ctx('client'),ctx('viewer'),ctx('owner','tenant-b')]){
  const response=await masterTrackerResponse('tenant-a',async requested=>{assert.equal(requested,'tenant-a');return state;});
  assert.ok([401,403].includes(response.status));
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  const body=await response.text();
  assert.ok(!body.includes('chatgpt.site'));assert.ok(!body.includes('Kavi.R'));assert.ok(!body.includes('projects'));
 }
});
test('Master Tracker allows only verified staff membership and returns a read-only HTTPS catalog',async()=>{
 for(const role of ['owner','admin','staff']){
  const response=await masterTrackerResponse('tenant-a',async()=>ctx(role));
  assert.equal(response.status,200);assert.equal(response.headers.get('vary'),'Cookie');
  const catalog=await response.json();assert.equal(catalog.projects.length,3);
  for(const url of [catalog.url,catalog.libraryUrl,...catalog.projects.map(p=>p.url)])assert.equal(new URL(url).protocol,'https:');
  assert.ok(!('tasks' in catalog));assert.ok(!('token' in catalog));
 }
});
test('a missing workspace fails before loading identity',async()=>{
 const response=await masterTrackerResponse(null,async()=>{throw Error('must not run');});assert.equal(response.status,400);
});
