import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {NextRequest,NextResponse} from 'next/server.js';
async function load(path,deps={}){
 let source=await readFile(new URL('../src/'+path,import.meta.url),'utf8');
 source=source.replace(/^import .*;\n/gm,'');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('exports',...Object.keys(deps),compiled)(exports,...Object.values(deps));return exports;
}
const origin=await load('lib/request-origin.ts');
const redirects=await load('lib/server/auth-response.ts',{NextResponse});
async function route(path,deps){return (await load('app/auth/'+path+'/route.ts',{NextResponse,supabase:async()=>deps.db,cookies:async()=>deps.jar,...origin,...redirects})).POST;}
const request=(path,values,origin='https://portal.example.test')=>new NextRequest('https://portal.example.test/auth/'+path,{method:'POST',headers:{origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values)});
function fixture(){const calls=[],set=[];return {calls,set,jar:{get:()=>({value:'client-user'}),set:(...args)=>set.push(args)},db:{auth:{getUser:async()=>({data:{user:{id:'client-user'}}}),verifyOtp:async p=>{calls.push(p);return {data:{user:{id:'client-user'}},error:null};},updateUser:async p=>{calls.push(p);return {error:null};}}}};}
test('cross-origin confirmation redirects to an explanation without consuming the token',async()=>{const f=fixture(),post=await route('confirm',f);const r=await post(request('confirm',{token_hash:'a'.repeat(64),type:'invite'},'https://evil.example'));assert.equal(r.status,303);assert.ok(r.headers.get('location').includes('/login?error='));assert.equal(r.headers.get('content-disposition'),null);assert.equal(f.calls.length,0);});
test('null Origin never bypasses confirmation CSRF protection',async()=>{const f=fixture(),post=await route('confirm',f);const r=await post(request('confirm',{token_hash:'a'.repeat(64),type:'invite'},'null'));assert.equal(r.status,303);assert.ok(r.headers.get('location').includes('/login?error='));assert.equal(f.calls.length,0);});
test('invalid invitation types cannot establish a setup session',async()=>{const f=fixture(),post=await route('confirm',f);const r=await post(request('confirm',{token_hash:'a'.repeat(64),type:'signup'}));assert.ok(r.headers.get('location').includes('/login'));assert.equal(f.calls.length,0);assert.equal(r.cookies.get('nxt-client-setup'),undefined);});
test('valid single-use verification binds setup to the authenticated account',async()=>{const f=fixture(),post=await route('confirm',f);const r=await post(request('confirm',{token_hash:'a'.repeat(64),type:'invite'}));assert.equal(r.headers.get('location'),'https://portal.example.test/auth/setup');const cookie=r.cookies.get('nxt-client-setup');assert.equal(cookie.value,'client-user');assert.equal(cookie.httpOnly,true);assert.equal(cookie.secure,true);assert.equal(cookie.path,'/auth');});
test('expired link does not create a password-setup marker',async()=>{const f=fixture();f.db.auth.verifyOtp=async()=>({data:{user:null},error:{message:'Expired'}});const post=await route('confirm',f);const r=await post(request('confirm',{token_hash:'a'.repeat(64),type:'recovery'}));assert.ok(r.headers.get('location').includes('/login'));assert.equal(r.cookies.get('nxt-client-setup'),undefined);});
test('password setup refuses a session for another account',async()=>{const f=fixture();f.jar.get=()=>({value:'other-user'});const post=await route('set-password',f);await post(request('set-password',{password:'Test-password-123',confirm:'Test-password-123'}));assert.equal(f.calls.length,0);});
test('password mismatch never calls Auth update',async()=>{const f=fixture(),post=await route('set-password',f);const r=await post(request('set-password',{password:'Test-password-123',confirm:'Different-password-123'}));assert.ok(r.headers.get('location').includes('/auth/setup?error='));assert.equal(f.calls.length,0);});
test('successful password setup clears the short-lived marker and opens portal',async()=>{const f=fixture(),post=await route('set-password',f);const r=await post(request('set-password',{password:'Test-password-123',confirm:'Test-password-123'}));assert.equal(f.calls.length,1);assert.equal(r.cookies.get('nxt-client-setup').maxAge,0);assert.equal(r.headers.get('location'),'https://portal.example.test/app');});
