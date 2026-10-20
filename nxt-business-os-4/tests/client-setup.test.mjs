import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {NextRequest,NextResponse} from 'next/server.js';
async function route(path,deps){
 let source=await readFile(new URL('../src/app/auth/'+path+'/route.ts',import.meta.url),'utf8');
 source=source.replace(/^import .*;\n/gm,'');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('exports','NextResponse','supabase','cookies',compiled)(exports,NextResponse,async()=>deps.db,async()=>deps.jar);return exports.POST;
}
const request=(path,values,origin='https://portal.example.test')=>new NextRequest('https://portal.example.test/auth/'+path,{method:'POST',headers:{origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values)});
function fixture(){const calls=[],set=[];return {calls,set,jar:{get:()=>({value:'client-user'}),set:(...args)=>set.push(args)},db:{auth:{getUser:async()=>({data:{user:{id:'client-user'}}}),verifyOtp:async p=>{calls.push(p);return {data:{user:{id:'client-user'}},error:null};},updateUser:async p=>{calls.push(p);return {error:null};}}}};}
test('cross-origin invitation confirmation cannot consume the token',async()=>{const f=fixture(),post=await route('confirm',f);assert.equal((await post(request('confirm',{token_hash:'a'.repeat(64),type:'invite'},'https://evil.example'))).status,403);assert.equal(f.calls.length,0);});
test('invalid invitation types cannot establish a setup session',async()=>{const f=fixture(),post=await route('confirm',f);const r=await post(request('confirm',{token_hash:'a'.repeat(64),type:'signup'}));assert.ok(r.headers.get('location').includes('/login'));assert.equal(f.calls.length,0);assert.equal(f.set.length,0);});
test('valid single-use verification binds setup to the authenticated account',async()=>{const f=fixture(),post=await route('confirm',f);const r=await post(request('confirm',{token_hash:'a'.repeat(64),type:'invite'}));assert.equal(r.headers.get('location'),'https://portal.example.test/auth/setup');assert.equal(f.set[0][1],'client-user');assert.equal(f.set[0][2].httpOnly,true);assert.equal(f.set[0][2].secure,true);});
test('expired link does not create a password-setup marker',async()=>{const f=fixture();f.db.auth.verifyOtp=async()=>({data:{user:null},error:{message:'Expired'}});const post=await route('confirm',f);const r=await post(request('confirm',{token_hash:'a'.repeat(64),type:'recovery'}));assert.ok(r.headers.get('location').includes('/login'));assert.equal(f.set.length,0);});
test('password setup refuses a session for another account',async()=>{const f=fixture();f.jar.get=()=>({value:'other-user'});const post=await route('set-password',f);await post(request('set-password',{password:'Test-password-123',confirm:'Test-password-123'}));assert.equal(f.calls.length,0);});
test('password mismatch never calls Auth update',async()=>{const f=fixture(),post=await route('set-password',f);const r=await post(request('set-password',{password:'Test-password-123',confirm:'Different-password-123'}));assert.ok(r.headers.get('location').includes('/auth/setup?error='));assert.equal(f.calls.length,0);});
test('successful password setup clears the short-lived marker and opens portal',async()=>{const f=fixture(),post=await route('set-password',f);const r=await post(request('set-password',{password:'Test-password-123',confirm:'Test-password-123'}));assert.equal(f.calls.length,1);assert.equal(f.set[0][2].maxAge,0);assert.equal(r.headers.get('location'),'https://portal.example.test/app');});
