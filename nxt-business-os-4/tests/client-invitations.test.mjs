import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/lib/server/client-invitations.ts',import.meta.url),'utf8');
const {deliverClientInvitation}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
function fixture({existing=false,providerFails=false,linkFails=false}={}){
 const calls=[],statuses=[];let count=0;
 const d={workspace:'workspace',clientId:'client',appUrl:'https://portal.example.test',db:{rpc:async(name,args)=>{calls.push(name);if(name==='reserve_client_invite')return {data:{id:'invitation',email:'client@example.test',client_title:'Client Ltd'},error:null};count++;return {data:linkFails&&count===2?'wrong-user':count===1&&!existing?null:'client-user',error:null};}},admin:{auth:{admin:{generateLink:async p=>{calls.push(p.type);return {data:{user:{id:'client-user'},properties:{hashed_token:'single-use-secret-hash',verification_type:p.type}},error:null};}}},from:()=>({update:s=>({eq:()=>({eq:async()=>{statuses.push(s);return {error:null};}})})})},send:async(email,subject,body,id)=>{calls.push('email');assert.equal(email,'client@example.test');assert.equal(id,'invitation');assert.ok(body.includes('https://portal.example.test/auth/accept?token_hash='));if(providerFails)throw Error('Provider failed');}};
 return {d,calls,statuses};
}
test('new client is linked before invitation email and token is never returned',async()=>{
 const f=fixture();const r=await deliverClientInvitation(f.d);
 assert.deepEqual(f.calls,['reserve_client_invite','link_client_login','invite','link_client_login','email']);assert.equal(f.statuses[0].status,'sent');assert.ok(!JSON.stringify(r).includes('single-use-secret-hash'));
});
test('resending for existing linked client uses a fresh recovery link',async()=>{const f=fixture({existing:true});await deliverClientInvitation(f.d);assert.ok(f.calls.includes('recovery'));assert.ok(!f.calls.includes('invite'));});
test('unsafe account link prevents all email delivery',async()=>{const f=fixture({linkFails:true});await assert.rejects(deliverClientInvitation(f.d),/linked safely/);assert.ok(!f.calls.includes('email'));assert.equal(f.statuses[0].status,'failed');});
test('provider failure is recorded without storing the setup token',async()=>{const f=fixture({providerFails:true});await assert.rejects(deliverClientInvitation(f.d),/Provider failed/);assert.equal(f.statuses[0].status,'failed');assert.ok(!JSON.stringify(f.statuses).includes('single-use-secret-hash'));});
test('owner reservation denial prevents Auth and email side effects',async()=>{const f=fixture();f.d.db.rpc=async()=>({data:null,error:{message:'Owner required'}});await assert.rejects(deliverClientInvitation(f.d),/Owner required/);assert.deepEqual(f.calls,[]);});
