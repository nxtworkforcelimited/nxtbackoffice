export type StatementInvoice={id:string;reference:string;title:string;total:number|string;created_at:string;due_date:string|null;status:string;deleted_at?:string|null};
export type StatementPayment={id:string;invoice_id:string;reference:string;amount:number|string;created_at:string;payment_method?:string|null};
export type StatementRow={id:string;date:string;reference:string;description:string;debit:number;credit:number;balance:number};
const statementDate=(value:string)=>value.includes('T')?new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Harare',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)):value.slice(0,10);
const cents=(n:number|string)=>{const value=Math.round(Number(n)*100);if(!Number.isSafeInteger(value))throw Error('Invalid statement amount');return value;};
export function accountStatement(invoices:StatementInvoice[],payments:StatementPayment[],from:string,to:string){
 const eligible=invoices.filter(i=>['issued','paid'].includes(i.status)&&!i.deleted_at);
 const byId=new Map(eligible.map(i=>[i.id,i]));
 const events=[...eligible.map(i=>({id:i.id,date:statementDate(i.created_at),time:i.created_at,reference:i.reference,description:'Invoice · '+i.title,debit:cents(i.total),credit:0,rank:0})),...payments.filter(p=>byId.has(p.invoice_id)).map(p=>({id:p.id,date:statementDate(p.created_at),time:p.created_at,reference:p.reference,description:(p.payment_method==='cash'?'Cash receipt':p.payment_method==='bank'?'Bank receipt':'Payment received')+' · '+byId.get(p.invoice_id)!.reference,debit:0,credit:cents(p.amount),rank:1}))].filter(e=>e.date<=to).sort((a,b)=>a.date.localeCompare(b.date)||a.rank-b.rank||a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
 let opening=0,balance=0,debits=0,credits=0;const rows:StatementRow[]=[];
 for(const e of events){balance+=e.debit-e.credit;if(e.date<from){opening=balance;continue;}debits+=e.debit;credits+=e.credit;rows.push({id:e.id,date:e.date,reference:e.reference,description:e.description,debit:e.debit/100,credit:e.credit/100,balance:balance/100});}
 return {opening:opening/100,debits:debits/100,credits:credits/100,closing:balance/100,rows};
}
