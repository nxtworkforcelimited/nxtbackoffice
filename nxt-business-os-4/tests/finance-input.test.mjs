import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ts from 'typescript';import {z} from 'zod';
const source=await readFile('src/lib/finance-input.ts','utf8');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {normalizeFinanceInput}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const route=await readFile('src/app/api/finance/route.ts','utf8');const save=Function('z',route.slice(route.indexOf('const id='),route.indexOf('const transition='))+'return save;')(z);
const input={action:'save',kind:'expense',title:'Office supplies',vendor:'',description:'',currency:'USD',amount:10,due_date:null,status:'draft',order_lines:[{description:'',quantity:1,unit_price:0}],billing_cycle:'monthly'};
test('expenses and subscriptions accept stale hidden order placeholders and persist no order items',()=>{
 for(const kind of ['expense','subscription']){const parsed=save.parse(normalizeFinanceInput({...input,kind}));assert.deepEqual(parsed.order_lines,[]);assert.equal(parsed.amount,10);}
 assert.equal(input.order_lines.length,1);
});
test('purchase orders still require valid item descriptions; expense amounts still require explicit numeric input',()=>{
 assert.equal(save.safeParse(normalizeFinanceInput({...input,kind:'purchase_order'})).success,false);
 assert.equal(save.safeParse(normalizeFinanceInput({...input,amount:undefined})).success,false);
 assert.equal(save.safeParse(normalizeFinanceInput({...input,amount:''})).success,false);
 assert.equal(save.safeParse(normalizeFinanceInput({...input,kind:'purchase_order',order_lines:[{description:'Paper',quantity:1,unit_price:10}]})).success,true);
});
