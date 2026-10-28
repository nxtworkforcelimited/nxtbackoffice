import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/lib/service-catalogue.ts',import.meta.url),'utf8');
const {serviceCatalogue:items,catalogueLine}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
test('catalogue preserves the PDF billing alternatives and all nine categories',()=>{
 assert.equal(new Set(items.map(i=>i.category)).size,9);assert.equal(new Set(items.map(i=>i.id)).size,items.length);
 assert.deepEqual(items.filter(i=>i.description.startsWith('Brand-led advertising campaign')).map(i=>[i.price,i.unit]),[[1500,'once-off'],[1200,'month']]);
 assert.deepEqual(items.filter(i=>i.description.startsWith('Graphic design')).map(i=>i.price),[20,200]);
 assert.deepEqual(items.filter(i=>i.description.startsWith('Email marketing')).map(i=>[i.price,i.unit]),[[150,'setup'],[100,'month']]);
 assert.equal(items.find(i=>i.description==='Data capturing').unit,'1,000 records');
});
test('selected lines are independent editable snapshots with valid invoice descriptions',()=>{
 for(const item of items){const line=catalogueLine(item);assert.ok(line.description.length<=300);assert.equal(line.unit_price,item.price);assert.equal(line.quantity,1);line.unit_price=123;assert.equal(item.price,items.find(i=>i.id===item.id).price);assert.notEqual(line,item);}
 const hosting=items.find(i=>i.description==='Hosting and domain');const line=catalogueLine(hosting);line.unit_price=99;assert.equal(hosting.price,10);assert.match(line.description,/per month/);
});
