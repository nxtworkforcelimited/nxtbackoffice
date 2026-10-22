import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ts from 'typescript';
const source=await readFile('src/lib/account-statement.ts','utf8');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;const {accountStatement}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const invoice=(id,date,total,status='issued')=>({id,reference:id,title:'Service',total,created_at:date,due_date:null,status});const payment=(id,invoice_id,date,amount)=>({id,invoice_id,reference:id,created_at:date,amount});
test('statement carries opening balance and applies part payments to a running and closing balance',()=>{
 const invoices=[invoice('old','2026-09-01',100),invoice('new','2026-10-10',50),invoice('future','2026-11-01',99),invoice('draft','2026-10-01',999,'draft'),invoice('void','2026-10-01',999,'void'),{...invoice('removed','2026-10-01',999),deleted_at:'2026-10-02'}];
 const payments=[payment('p1','old','2026-09-20',20),payment('p2','old','2026-10-05',30),payment('p3','new','2026-10-12',10),payment('p4','new','2026-11-01',40),payment('other','other-customer','2026-10-01',1000)];
 const s=accountStatement(invoices,payments,'2026-10-01','2026-10-31');assert.equal(s.opening,80);assert.equal(s.debits,50);assert.equal(s.credits,40);assert.equal(s.closing,90);assert.deepEqual(s.rows.map(r=>r.balance),[50,100,90]);assert.equal(s.opening+s.debits-s.credits,s.closing);
});
test('exact cents, date boundaries, empty periods and full settlement',()=>{
 const invoices=[invoice('A','2026-01-01',0.30,'paid')],payments=[payment('p','A','2026-01-01',0.10),payment('p2','A','2026-01-31',0.20)];
 const s=accountStatement(invoices,payments,'2026-01-01','2026-01-31');assert.equal(s.rows[1].balance,0.20);assert.equal(s.closing,0);assert.equal(s.credits,0.30);assert.equal(s.rows[0].debit,0.30);
 const empty=accountStatement(invoices,[],'2026-02-01','2026-02-28');assert.equal(empty.opening,0.30);assert.equal(empty.closing,0.30);assert.deepEqual(empty.rows,[]);
});

test('statement dates use Harare time at month boundaries',()=>{const s=accountStatement([invoice('A','2026-09-30T23:30:00Z',10)],[],'2026-10-01','2026-10-31');assert.equal(s.opening,0);assert.equal(s.rows[0].date,'2026-10-01');assert.equal(s.debits,10);});
