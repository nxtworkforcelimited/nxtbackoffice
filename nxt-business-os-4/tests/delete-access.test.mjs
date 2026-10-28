import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/lib/delete-access.ts',import.meta.url),'utf8');
const {canDeleteRecords}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
test('delete access belongs only to the confirmed Nyasha owner account',()=>{assert.equal(canDeleteRecords('nyasha@nxt-workforce.com','owner'),true);assert.equal(canDeleteRecords('NYASHA@NXT-WORKFORCE.COM','owner'),true);for(const email of ['nyasha.m@nxt-workforce.com','nyasham@nxt-workforce.com','michael@nxt-workforce.com','nyasha@nxt-workforce.com.evil.test',undefined])assert.equal(canDeleteRecords(email,'owner'),false);for(const role of ['admin','staff','client'])assert.equal(canDeleteRecords('nyasha@nxt-workforce.com',role),false);});
