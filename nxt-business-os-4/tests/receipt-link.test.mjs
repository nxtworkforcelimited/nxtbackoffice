import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const read=f=>readFile(new URL('../'+f,import.meta.url),'utf8');
const js=ts.transpileModule(await read('src/lib/server/receipt-link.ts'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
process.env.RECEIPT_LINK_SECRET='test-secret-one';
const m=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const id='3f9a12bc-1111-4222-8333-444455556666';
test('a signed link opens its own payment and is stable',()=>{
 const t=m.signReceipt(id);assert.equal(t.length,54);assert.equal(m.verifyReceipt(t),id);assert.equal(m.signReceipt(id),t);
});
test('tampered, swapped or malformed links are refused',()=>{
 const t=m.signReceipt(id),other=m.signReceipt('aaaaaaaa-1111-4222-8333-444455556666');
 assert.equal(m.verifyReceipt(other.slice(0,22)+t.slice(22)),null,'id swapped onto another signature');
 assert.equal(m.verifyReceipt(t.slice(0,53)+(t.endsWith('A')?'B':'A')),null);
 for(const bad of ['','abc',t+'x',t.slice(1),'../../etc/passwd','a'.repeat(54)])assert.equal(m.verifyReceipt(bad),null,bad);
 assert.equal(m.signReceipt('not-a-uuid'),null);assert.equal(m.signReceipt("1' or '1'='1"),null);
});
test('changing the secret cancels every old link',async()=>{
 const t=m.signReceipt(id);process.env.RECEIPT_LINK_SECRET='another-secret';
 assert.equal(m.verifyReceipt(t),null);process.env.RECEIPT_LINK_SECRET='test-secret-one';assert.equal(m.verifyReceipt(t),id);
});
test('page: no index, no login redirect, one receipt only, no other client data',async()=>{
 const p=await read('src/app/r/[token]/page.tsx'),px=await read('src/proxy.ts'),r=await read('src/app/api/sms/route.ts');
 assert.match(p,/index:false/);assert.match(p,/verifyReceipt\(token\)/);assert.match(p,/eq\('id',id\)/);
 assert.doesNotMatch(p,/\.phone|\.email|internal_notes/);
 assert.doesNotMatch(px,/'\/r\//);
 assert.match(r,/signReceipt\(pay\.data\.id\)/);
});
