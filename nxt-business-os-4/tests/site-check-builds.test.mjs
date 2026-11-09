import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const load=async f=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(await readFile(new URL('../src/lib/'+f,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const {analyzeHtml,isPublicIp,summarise}=await load('site-check.ts');
const read=f=>readFile(new URL('../'+f,import.meta.url),'utf8');
const state=(checks,k)=>checks.find(c=>c.key===k).state;

const good='<html lang="en"><head><title>Acme Plumbing in Harare</title><meta name="description" content="Acme Plumbing fixes leaks, installs geysers and handles emergencies across Harare, day or night."><meta name="viewport" content="width=device-width"><meta property="og:image" content="/x.png"><link rel="canonical" href="https://a.com"><link rel="icon" href="/f.ico"></head><body><h1>Plumbing</h1><img src="a.png" alt="van"></body></html>';
test('a healthy page passes every page check',()=>{
 const c=analyzeHtml(good);assert.deepEqual(summarise(c),{pass:c.length,warn:0,fail:0});
});
test('a bare page fails the basics',()=>{
 const c=analyzeHtml('<html><body><h1>A</h1><h1>B</h1><img src="x.png"></body></html>');
 for(const k of ['title','description','viewport'])assert.equal(state(c,k),'fail',k);
 assert.equal(state(c,'h1'),'warn');assert.equal(state(c,'alt'),'warn');assert.equal(state(c,'og_image'),'warn');
});
test('noindex is a failure and meta tags in any attribute order are read',()=>{
 const c=analyzeHtml('<html><head><meta content="noindex, nofollow" name="robots"><meta content="'+'d'.repeat(80)+'" name="description"></head></html>');
 assert.equal(state(c,'indexing'),'fail');assert.equal(state(c,'description'),'pass');
});
test('private and internal addresses are refused',()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','172.31.255.255','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','::1','fe80::1','fd00::1','::ffff:127.0.0.1','::ffff:10.0.0.1','224.0.0.1','999.1.1.1','not-an-ip'])assert.equal(isPublicIp(ip),false,ip);
 for(const ip of ['8.8.8.8','1.1.1.1','172.15.0.1','172.32.0.1','2606:4700:4700::1111','::ffff:8.8.8.8'])assert.equal(isPublicIp(ip),true,ip);
});
test('check route: staff with ticket access only, own workspace, public sites only',async()=>{
 const r=await read('src/app/api/builds/check/route.ts'),f=await read('src/lib/server/site-fetch.ts');
 assert.match(r,/role==='client'/);assert.match(r,/'tickets'/);assert.match(r,/trustedRequest/);assert.match(r,/eq\('tenant_id',c\.workspace\.id\)/);
 assert.match(f,/isPublicIp/);assert.match(f,/lookup:/);assert.match(f,/MAX_BYTES/);assert.match(f,/username\|\|current\.password/);
});
test('builds: archive and restore, never delete; every query stays in the workspace',async()=>{
 const r=await read('src/app/api/builds/route.ts'),u=await read('src/components/builds.tsx');
 assert.doesNotMatch(r,/\.delete\(\)/);assert.match(r,/archived_at/);assert.doesNotMatch(u,/Delete build/);
 assert.doesNotMatch(u,/76e3f054-7bdf-4670-800e-c54329dfa4dd/,'no hard-coded staff accounts');
 assert.match(u,/Must pass before launch/);
});
test('launch checks: six core website checks and the old ones are kept',async()=>{
 const u=await read('src/components/builds.tsx');
 const core=u.match(/coreWebsiteKeys=\[([^\]]*)\]/)[1].match(/'[a-z_]+'/g);assert.equal(core.length,6);
 for(const k of ['content','desktop','mobile','links','forms','contacts','seo','analytics','domain','performance'])assert.match(u,new RegExp("key:'"+k+"'"));
});
test('migration is additive',async()=>{
 const s=await read('supabase/migrations/202611090005_builds_tasks_archive_site_check.sql');
 assert.doesNotMatch(s,/drop table|truncate|delete from|drop column/i);
 for(const c of ['tasks','archived_at','site_check','site_checked_at'])assert.match(s,new RegExp('add column if not exists[\\s\\S]*'+c));
});
