import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const load=async(file,deps={})=>{const js=ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};Function('require','module','exports',js)(n=>deps[n]??require(n),m,m.exports);return m.exports;};
const chartLib=await load('src/lib/accounting.ts');
const t=await load('src/lib/accounting-tools.ts',{'./accounting':chartLib});
const j=(id,date,description,lines)=>({id,entry_date:date,description,lines:lines.map(([account,debit,credit])=>({account,debit,credit}))});
const posted=[
 j('1','2026-09-22','LOAN',[['1000',2400,0],['2400',0,2400]]),
 j('2','2026-09-23','DELL LAPTOP 001',[['1400',440,0],['1000',0,440]]),
 j('3','2026-10-01','September Salaries',[['5010',668,0],['1000',0,668]]),
 j('4','2026-10-09','INV/2026/00001',[['1100',500,0],['4000',0,500]]),
 j('5','2026-10-10','INV/2026/00002',[['1100',850,0],['4000',0,850]]),
 j('6','2026-10-15','Rent October',[['5020',400,0],['1000',0,400]])];
const today='2026-11-09';

// The 25 Odoo journal entries from the screenshots, totalling 9,688.00 with the two cut-off amounts read from the total.
const odoo=[['INV/2026/00002',850],['INV/2026/00001',500],['September Salaries',668],['LOAN04',500],['LOAN03',1100],['Loan',210],['WORK PHONE 001',150],['Table transport',50],['TABLE003',250],['TABLE 001',130],['RENTAL DEPO',150],['RENTAL 01',400],['RENTAL 00',400],['OFFICE TABLE 002',140],['DELL MONITOR002',120],['DELL MONITOR001',150],['DELL LAPTOP 011',150],['DELL LAPTOP 010',20],['DELL LAPTOP 009',20],['DELL LAPTOP 008',80],['DELL LAPTOP 007',170],['DELL LAPTOP 006',200],['DELL LAPTOP 002',440],['DELL LAPTOP 001',440],['LOAN',2400]];

test('every imported Odoo entry gets balanced suggested lines and the total matches Odoo',()=>{
 assert.equal(odoo.length,25);assert.equal(odoo.reduce((n,r)=>n+r[1]*100,0)/100,9688);
 for(const [d,a] of odoo){const s=t.suggestLines(d,a);assert.ok(s,d+' has a suggestion');assert.equal(s.lines.length,2);assert.equal(s.lines[0].debit,a);assert.equal(s.lines[1].credit,a);assert.ok(chartLib.accountNames[s.lines[0].account]);assert.ok(chartLib.accountNames[s.lines[1].account]);}
});
test('suggestions pick the right accounts',()=>{
 const pair=(d)=>{const s=t.suggestLines(d,100);return s.lines[0].account+'/'+s.lines[1].account;};
 assert.equal(pair('KEMBO KAMUPIRA LOAN'),'1000/2400');assert.equal(pair('KEMBO KAMUPIRA LAON'),'1000/2400');
 assert.equal(pair('DELL LAPTOP 006'),'1400/1000');assert.equal(pair('OFFICE TABLE 002'),'1410/1000');assert.equal(pair('WORK PHONE 001'),'1420/1000');
 assert.equal(pair('RENTAL DEPO'),'1310/1000');assert.equal(pair('RENTAL 01'),'5020/1000');assert.equal(pair('Table transport'),'5060/1000');
 assert.equal(pair('September Salaries'),'5010/1000');assert.equal(pair('INV/2026/00001'),'1100/4000');
 assert.equal(t.suggestLines('Mystery purchase',100),null);assert.equal(t.suggestLines('LOAN',null),null);assert.equal(t.suggestLines('LOAN',0),null);
});
test('quick entry lines balance and reject bad amounts',()=>{
 const l=t.entryLines('cashsale',75.5);assert.deepEqual(l,[{account:'1030',debit:75.5,credit:0},{account:'4000',debit:0,credit:75.5}]);
 assert.equal(t.entryLines('rent',0),null);assert.equal(t.entryLines('rent',Number.NaN),null);
 for(const e of t.entryTypes){assert.ok(chartLib.accountNames[e.debit],e.key);assert.ok(chartLib.accountNames[e.credit],e.key);}
 assert.equal(t.blankLines([]),true);assert.equal(t.blankLines([{account:'1000',debit:0,credit:0}]),true);assert.equal(t.blankLines(l),false);
});
test('csv import groups lines, validates balance, accounts, dates and numbers',()=>{
 const ok=t.parseJournalCsv('date,description,account,debit,credit,entry\n2026-09-23,"DELL, LAPTOP 001",1400,440,0,1\n2026-09-23,"DELL, LAPTOP 001",1000,0,440,1\n23/09/2026,Rent,5020,"$1,000.00",0\n23/09/2026,Rent,1000,0,1000');
 assert.deepEqual(ok.errors,[]);assert.equal(ok.entries.length,2);assert.equal(ok.entries[0].description,'DELL, LAPTOP 001');assert.equal(ok.entries[1].entry_date,'2026-09-23');assert.equal(ok.entries[1].lines[0].debit,1000);
 const bad=t.parseJournalCsv('2026-09-23,Loan,1000,500,0\n2026-09-23,Loan,2400,0,400\n2026-09-24,X,9999,1,0\n2026-13-45,Y,1000,1,0\n2026-09-25,Z,1000,abc,0\n2026-09-25,Q,1000');
 assert.equal(bad.entries.length,0);assert.ok(bad.errors.some(e=>/does not balance/.test(e)));assert.ok(bad.errors.some(e=>/9999/.test(e)));assert.ok(bad.errors.some(e=>/date/.test(e)));assert.ok(bad.errors.some(e=>/numbers/.test(e)));assert.ok(bad.errors.some(e=>/needs date/.test(e)));
 assert.equal(t.parseJournalCsv('2026-09-23,One sided,1000,5,0').errors.length,1);
});
test('ledger shows opening balance, running balance and natural side',()=>{
 const g=t.ledgerRows(posted,'1000','2026-10-01','2026-10-31');
 assert.equal(g.opening,1960);assert.equal(g.rows.length,2);assert.equal(g.rows[0].balance,1292);assert.equal(g.closing,892);
 const loan=t.ledgerRows(posted,'2400','','');assert.equal(loan.closing,2400);assert.equal(loan.rows[0].balance,2400);
 assert.equal(t.accountBalance(posted,'4000'),1350);assert.equal(t.groupTotal(posted,'expense'),1068);
});
test('periods understand months, years and relative dates',()=>{
 assert.equal(t.parsePeriod('profit in october',today).from,'2026-10-01');assert.equal(t.parsePeriod('profit in october',today).to,'2026-10-31');
 assert.equal(t.parsePeriod('december',today).from,'2025-12-01');assert.equal(t.parsePeriod('sales this year',today).from,'2026-01-01');
 assert.equal(t.parsePeriod('revenue last month',today).to,'2026-10-31');assert.equal(t.parsePeriod('revenue in 2025',today).to,'2025-12-31');assert.equal(t.parsePeriod('cash',today).from,'');
});
test('questions are answered from posted journals only, with the right figures',()=>{
 const drafts=[{status:'draft',description:'LOAN04',amount:500,lines:[]},{status:'approved',description:'x',amount:5,lines:[{account:'1000',debit:5,credit:0},{account:'4000',debit:0,credit:5}]}];
 const a=(q)=>t.answerQuestion(q,posted,drafts,today);
 assert.match(a('What is our profit this year?').answer,/Net profit.*USD 282\.00/);assert.match(a('profit in october?').answer,/USD 282\.00/);
 assert.match(a('What was our profit in September?').answer,/Net loss.*USD 0\.00|Net profit.*USD 0\.00/);
 assert.match(a('how much revenue did we make this month').answer,/USD 0\.00/);assert.match(a('total sales').answer,/USD 1,350\.00/);
 assert.match(a('How much cash do we have?').answer,/USD 892\.00/);
 assert.match(a('How much do we owe on the company loan?').answer,/USD 2,400\.00/);assert.match(a('what do we owe Kembo').answer,/2,400\.00/);
 assert.match(a('what are our total expenses').answer,/USD 1,068\.00/);assert.match(a('how much did we spend on rent').answer,/Rent.*USD 400\.00/);
 assert.match(a('how much are customers owing us').answer,/Accounts receivable.*USD 1,350\.00/);
 assert.match(a('what are our total assets').answer,/USD 2,682\.00\./);
 assert.match(a('is the trial balance balanced?').answer,/^Yes/);
 assert.match(a('what is waiting for approval').answer,/2 journals are not posted yet: 1 draft, 1 approved/);assert.match(a('what is waiting for approval').details.join(' '),/1 of them has no account lines/);
 assert.equal(a('how many journal entries').answer.startsWith('6 posted'),true);
 assert.match(a('where do I find the income statement').answer,/Income statement/);assert.equal(a('where do I find the balance sheet').tab,'Balance sheet');
 assert.match(a('what is the balance of account 1400').answer,/Computer equipment.*USD 440\.00/);
 assert.ok(a('what is our profit').details.some(d=>/2 unposted journals/.test(d)));
 assert.equal(a('tell me a joke about invoices and the weather'),null);assert.equal(a('   '),null);
});
test('unbalanced books are reported honestly',()=>{
 const bad=[j('x','2026-01-01','Bad',[['1000',10,0],['4000',0,5]])];
 assert.match(t.answerQuestion('do the books balance?',bad,[],today).answer,/^No\..*USD 5\.00/);
});
