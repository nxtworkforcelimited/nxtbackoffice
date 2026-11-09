import {chart,accountNames} from './accounting';
export type JLine={account:string;debit:number;credit:number};
export type JEntry={id:string;entry_date:string;description:string;lines:JLine[]};
export type DraftLite={status:string;description:string;amount:number|null;lines:JLine[]};
export type Answer={answer:string;details?:string[];tab?:string;matched:string};
const cents=(n:number)=>Math.round(Number(n)*100);
export const usd=(n:number)=>(n<0?'-':'')+'USD '+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const groupOf=(code:string)=>chart.find(a=>a.code===code)?.group;
const debitNormal=(code:string)=>['asset','expense'].includes(groupOf(code)??'');

/** Money in or out of a pair of accounts, used for quick entries and for filling blank imported drafts. */
export const entryTypes=[
 {key:'loan',label:'Loan received from a director',debit:'1000',credit:'2400'},
 {key:'laptops',label:'Computers or laptops bought',debit:'1400',credit:'1000'},
 {key:'furniture',label:'Furniture or tables bought',debit:'1410',credit:'1000'},
 {key:'phones',label:'Phone or office equipment bought',debit:'1420',credit:'1000'},
 {key:'deposit',label:'Rental deposit paid',debit:'1310',credit:'1000'},
 {key:'rent',label:'Rent paid',debit:'5020',credit:'1000'},
 {key:'salaries',label:'Salaries paid',debit:'5010',credit:'1000'},
 {key:'software',label:'Software or hosting paid',debit:'5040',credit:'1000'},
 {key:'transport',label:'Transport or travel paid',debit:'5060',credit:'1000'},
 {key:'expense',label:'Other expense paid',debit:'5000',credit:'1000'},
 {key:'invoice',label:'Sale invoiced to a customer',debit:'1100',credit:'4000'},
 {key:'received',label:'Customer payment received (bank)',debit:'1000',credit:'1100'},
 {key:'cashsale',label:'Cash sale',debit:'1030',credit:'4000'}
] as const;
export type EntryTypeKey=typeof entryTypes[number]['key'];
export function entryLines(key:EntryTypeKey,amount:number):JLine[]|null{
 const t=entryTypes.find(x=>x.key===key);if(!t||!Number.isFinite(amount)||amount<=0)return null;
 return [{account:t.debit,debit:amount,credit:0},{account:t.credit,debit:0,credit:amount}];
}
/** Suggests which accounts a described amount belongs in. Always a suggestion: a reviewer still approves it. */
export function suggestLines(description:string,amount:number|null):{key:EntryTypeKey;label:string;lines:JLine[]}|null{
 const d=description.toLowerCase();if(!amount||!(amount>0))return null;
 const key:EntryTypeKey|null=/rent(al)?\s*dep|deposit/.test(d)?'deposit'
 :/\brent/.test(d)?'rent'
 :/loan|laon/.test(d)?'loan'
 :/laptop|monitor|computer|\bpc\b/.test(d)?'laptops'
 :/table|desk|chair|furniture|cabinet/.test(d)&&!/transport/.test(d)?'furniture'
 :/phone|printer|router|office equipment/.test(d)?'phones'
 :/transport|travel|fuel|taxi/.test(d)?'transport'
 :/salar|wage|payroll/.test(d)?'salaries'
 :/hosting|software|subscription|domain/.test(d)?'software'
 :/^inv[\/\-]|invoice/.test(d)?'invoice':null;
 if(!key)return null;const lines=entryLines(key,amount);const t=entryTypes.find(x=>x.key===key);
 return lines&&t?{key,label:t.label,lines}:null;
}
export const blankLines=(lines:JLine[])=>!lines.length||lines.every(l=>!cents(l.debit)&&!cents(l.credit));

/** Totals per account in whole cents, debit minus credit. */
export function totals(journals:{lines:JLine[]}[]){const m=new Map<string,number>();for(const j of journals)for(const l of j.lines)m.set(l.account,(m.get(l.account)??0)+cents(l.debit)-cents(l.credit));return m;}
const natural=(code:string,raw:number)=>(debitNormal(code)?raw:-raw)/100;
export function accountBalance(journals:{lines:JLine[]}[],code:string){return natural(code,totals(journals).get(code)??0);}
export function groupTotal(journals:{lines:JLine[]}[],group:string,codes?:string[]){const t=totals(journals);let raw=0;for(const a of chart)if(a.group===group&&(!codes||codes.includes(a.code)))raw+=t.get(a.code)??0;return (['asset','expense'].includes(group)?raw:-raw)/100;}

/** General ledger for one account with a running balance on its natural side. */
export function ledgerRows(journals:JEntry[],code:string,from:string,to:string){
 const sorted=[...journals].sort((a,b)=>a.entry_date.localeCompare(b.entry_date));
 let raw=0;const sign=debitNormal(code)?1:-1;
 const opening=sorted.filter(j=>from&&j.entry_date<from).reduce((n,j)=>n+j.lines.filter(l=>l.account===code).reduce((s,l)=>s+cents(l.debit)-cents(l.credit),0),0);
 raw=opening;const rows:{date:string;description:string;debit:number;credit:number;balance:number}[]=[];
 for(const j of sorted){if(from&&j.entry_date<from)continue;if(to&&j.entry_date>to)continue;
  for(const l of j.lines.filter(x=>x.account===code)){raw+=cents(l.debit)-cents(l.credit);rows.push({date:j.entry_date,description:j.description,debit:Number(l.debit),credit:Number(l.credit),balance:sign*raw/100});}}
 return {opening:sign*opening/100,closing:sign*raw/100,rows};
}
const csvCell=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
export const toCsv=(rows:unknown[][])=>rows.map(r=>r.map(csvCell).join(',')).join('\n');

/** Reads rows pasted from an Odoo or spreadsheet export: date, description, account code, debit, credit (optional first or last column: entry). */
export function parseJournalCsv(text:string):{entries:{entry_date:string;description:string;lines:JLine[]}[];errors:string[]}{
 const errors:string[]=[];const rows:string[][]=[];
 for(const raw of text.split(/\r?\n/)){if(!raw.trim())continue;const cells:string[]=[];let cur='',q=false;
  for(let i=0;i<raw.length;i++){const ch=raw[i];if(q){if(ch==='"'&&raw[i+1]==='"'){cur+='"';i++;}else if(ch==='"')q=false;else cur+=ch;}else if(ch==='"')q=true;else if(ch===','||ch==='\t'||ch===';'){cells.push(cur.trim());cur='';}else cur+=ch;}
  cells.push(cur.trim());rows.push(cells);}
 let start=0;if(rows[0]&&/date/i.test(rows[0][0]??'')&&/account|debit/i.test(rows[0].join(' ')))start=1;
 const groups=new Map<string,{entry_date:string;description:string;lines:JLine[]}>();
 const date=(s:string)=>{const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(iso)return s;const dm=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);if(dm)return dm[3]+'-'+dm[2].padStart(2,'0')+'-'+dm[1].padStart(2,'0');return '';};
 const num=(s:string)=>{const v=s.replace(/[$,\s]|USD/gi,'');if(v==='')return 0;const n=Number(v);return Number.isFinite(n)?n:NaN;};
 for(let i=start;i<rows.length;i++){const r=rows[i];const n=i+1;
  if(r.length<5){errors.push('Row '+n+': needs date, description, account, debit and credit.');continue;}
  const [d,desc,acc,deb,cre,key]=r;const day=date(d);
  if(!day||Number.isNaN(Date.parse(day))){errors.push('Row '+n+': the date "'+d+'" is not valid. Use YYYY-MM-DD or DD/MM/YYYY.');continue;}
  const code=acc.match(/\d{4}/)?.[0]??'';if(!accountNames[code]){errors.push('Row '+n+': account "'+acc+'" is not in the chart of accounts.');continue;}
  const debit=num(deb),credit=num(cre);if(!(debit>=0)||!(credit>=0)||Number.isNaN(debit)||Number.isNaN(credit)){errors.push('Row '+n+': debit and credit must be numbers, zero or more.');continue;}
  if(!desc){errors.push('Row '+n+': description is empty.');continue;}
  const k=(key||day+'|'+desc);const g=groups.get(k)??{entry_date:day,description:desc.slice(0,300),lines:[]};g.lines.push({account:code,debit,credit});groups.set(k,g);}
 const entries=[...groups.values()].filter(g=>{const dr=g.lines.reduce((s,l)=>s+cents(l.debit),0),cr=g.lines.reduce((s,l)=>s+cents(l.credit),0);
  if(g.lines.length<2){errors.push('"'+g.description+'": an entry needs at least two lines.');return false;}
  if(dr!==cr){errors.push('"'+g.description+'" does not balance: debits '+usd(dr/100)+' and credits '+usd(cr/100)+'.');return false;}
  if(dr===0){errors.push('"'+g.description+'": the amounts are all zero.');return false;}return true;});
 return {entries,errors};
}

const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
const pad=(n:number)=>String(n).padStart(2,'0');
const lastDay=(y:number,m:number)=>new Date(Date.UTC(y,m,0)).getUTCDate();
export function parsePeriod(q:string,today:string):{from:string;to:string;label:string;stated:boolean}{
 const t=q.toLowerCase();const y=Number(today.slice(0,4)),m=Number(today.slice(5,7));
 const monthIdx=months.findIndex(n=>new RegExp('\\b'+n+'\\b').test(t));
 if(monthIdx>=0){const yr=Number(t.match(/\b(20\d\d)\b/)?.[1]??(monthIdx+1>m?y-1:y));const mm=monthIdx+1;return {from:yr+'-'+pad(mm)+'-01',to:yr+'-'+pad(mm)+'-'+pad(lastDay(yr,mm)),label:months[monthIdx][0].toUpperCase()+months[monthIdx].slice(1)+' '+yr,stated:true};}
 if(/last month/.test(t)){const pm=m===1?12:m-1,py=m===1?y-1:y;return {from:py+'-'+pad(pm)+'-01',to:py+'-'+pad(pm)+'-'+pad(lastDay(py,pm)),label:'last month',stated:true};}
 if(/this month/.test(t))return {from:y+'-'+pad(m)+'-01',to:today,label:'this month',stated:true};
 if(/last year/.test(t))return {from:(y-1)+'-01-01',to:(y-1)+'-12-31',label:String(y-1),stated:true};
 if(/this year|year to date|ytd|so far this year/.test(t))return {from:y+'-01-01',to:today,label:'this year to date',stated:true};
 const yr=t.match(/\b(20\d\d)\b/)?.[1];if(yr)return {from:yr+'-01-01',to:yr+'-12-31',label:yr,stated:true};
 return {from:'',to:today,label:'all posted entries to date',stated:false};
}
const inPeriod=(js:JEntry[],from:string,to:string)=>js.filter(j=>(!from||j.entry_date>=from)&&(!to||j.entry_date<=to));
const keywordAccounts:[RegExp,string][]=[[/\brent\b/,'5020'],[/salar|wage/,'5010'],[/software|hosting/,'5040'],[/internet|telephone|airtime|data bundle/,'5030'],[/advertis|marketing spend/,'5050'],[/transport|travel/,'5060'],[/professional fee/,'5070'],[/bank (charge|fee)/,'5080'],[/office suppl|stationery/,'5090'],[/depreciation/,'5100'],[/repair/,'5110'],[/income tax|corporate tax/,'5200'],[/\bvat\b/,'2110'],[/laptop|computer|monitor/,'1400'],[/furniture|table/,'1410'],[/deposit/,'1310'],[/prepay/,'1300'],[/petty cash/,'1010'],[/mobile money|ecocash/,'1020'],[/cash on hand/,'1030'],[/receivable|debtors|owed to us|owe us|owes us|owing us|owing me|customers? owe|unpaid invoice|outstanding invoice/,'1100'],[/payable|creditors/,'2000']];
const findAccount=(t:string)=>{const code=t.match(/\b(\d{4})\b/)?.[1];if(code&&accountNames[code])return code;
 const byName=[...chart].sort((a,b)=>b.name.length-a.name.length).find(a=>t.includes(a.name.toLowerCase()));if(byName)return byName.code;
 return keywordAccounts.find(([re])=>re.test(t))?.[1]??null;};

/** Answers common accounting questions straight from posted journals. Returns null for anything it cannot answer exactly. */
export function answerQuestion(question:string,posted:JEntry[],drafts:DraftLite[],today:string):Answer|null{
 const t=question.toLowerCase().replace(/[?!]/g,' ').replace(/\s+/g,' ').trim();if(!t)return null;
 const p=parsePeriod(t,today);const flow=inPeriod(posted,p.from,p.to);const asAt=posted.filter(j=>!p.to||j.entry_date<=p.to);
 const waiting=drafts.filter(d=>d.status!=='posted');
 const note=waiting.length?'Not included: '+waiting.length+' unposted journal'+(waiting.length===1?'':'s')+' in the Review queue.':'';
 const withNote=(a:Answer):Answer=>({...a,details:[...(a.details??[]),...(note?[note]:[])]});
 if(/where|how do i|how can i|find/.test(t)){
  const guide:[RegExp,string,string][]=[[/balance sheet/,'Balance sheet','Open Accounting and choose Balance sheet. Choose the date to report as at.'],[/income statement|profit and loss|p&l/,'Income statement','Open Accounting and choose Income statement. Choose the period with From and To.'],[/trial balance/,'Trial balance','Open Accounting and choose Trial balance.'],[/journal/,'Journal entries','Open Accounting and choose Journal entries for posted journals, or Journal items for each debit and credit line.'],[/ledger/,'General ledger','Open Accounting and choose General ledger, then pick the account.'],[/invoice|statement of account/,'Unpaid invoices','Invoices are under Accounting, Invoices. Unpaid invoice balances are under Unpaid invoices.']];
  const g=guide.find(x=>x[0].test(t));if(g)return {matched:'guide',tab:g[1],answer:g[2]};}
 if(/balance(d)?\b.*(trial|debit)|trial balance.*(balance|agree|match)|do(es)? .*(books|ledger).*balance|debits? (equal|match)/.test(t)){
  const tt=totals(asAt);let dr=0,cr=0;for(const v of tt.values()){if(v>0)dr+=v;else cr-=v;}
  return withNote({matched:'trial_balance',tab:'Trial balance',answer:dr===cr?'Yes. The trial balance agrees: debits and credits are both '+usd(dr/100)+'.':'No. Debits are '+usd(dr/100)+' and credits are '+usd(cr/100)+', a difference of '+usd(Math.abs(dr-cr)/100)+'.'});}
 if(/(waiting|awaiting|pending|needs?|to be)( for)? (approv|review|post)|review queue|drafts?\b|unposted/.test(t)){
  const by=(s:string)=>waiting.filter(d=>d.status===s).length;const blank=waiting.filter(d=>blankLines(d.lines)).length;
  return {matched:'drafts',tab:'Review queue',answer:waiting.length?waiting.length+' journal'+(waiting.length===1?' is':'s are')+' not posted yet: '+by('draft')+' draft, '+by('approved')+' approved and waiting to be posted.':'Nothing is waiting. Every journal is posted.',details:blank?[blank+(blank===1?' of them has':' of them have')+' no account lines yet, so they cannot be approved. Use "Fill suggested lines" in the Review queue.']:[]};}
 if(/how many (journal|entries)|number of (journal|entries)/.test(t))return withNote({matched:'count',tab:'Journal entries',answer:flow.length+' posted journal entr'+(flow.length===1?'y':'ies')+' for '+p.label+'.'});
 if(/(latest|last|recent) (journal|entries|transactions?)/.test(t)){const r=[...flow].sort((a,b)=>b.entry_date.localeCompare(a.entry_date)).slice(0,5);
  return withNote({matched:'recent',tab:'Journal entries',answer:r.length?'The most recent posted entries are listed below.':'There are no posted entries for '+p.label+'.',details:r.map(j=>j.entry_date+' · '+j.description+' · '+usd(j.lines.reduce((s,l)=>s+Number(l.debit),0)))});}
 if(/\b(profit|loss|net income|surplus|bottom line)\b/.test(t)){const rev=groupTotal(flow,'income'),exp=groupTotal(flow,'expense'),net=(cents(rev)-cents(exp))/100;
  return withNote({matched:'profit',tab:'Income statement',answer:(net>=0?'Net profit':'Net loss')+' for '+p.label+' is '+usd(Math.abs(net))+'.',details:['Revenue '+usd(rev),'Expenses '+usd(exp)]});}
 if(/\b(revenue|sales|turnover|income|earned|made)\b/.test(t)&&!/tax/.test(t)){
  const code=findAccount(t);if(!code||groupOf(code)==='income'){const v=code?accountBalance(flow,code):groupTotal(flow,'income');
   return withNote({matched:'revenue',tab:'Income statement',answer:(code?accountNames[code]:'Total revenue')+' for '+p.label+' is '+usd(v)+'.'});}}
 const account=findAccount(t);
 if(/\b(expenses?|spend|spent|costs?)\b/.test(t)&&(!account||groupOf(account)==='expense')){
  if(account){const v=accountBalance(flow,account);return withNote({matched:'expense_account',tab:'Income statement',answer:accountNames[account]+' for '+p.label+' is '+usd(v)+'.'});}
  const rows=chart.filter(a=>a.group==='expense').map(a=>[a.name,accountBalance(flow,a.code)] as [string,number]).filter(r=>r[1]!==0).sort((a,b)=>b[1]-a[1]);
  return withNote({matched:'expenses',tab:'Income statement',answer:'Total expenses for '+p.label+' are '+usd(groupTotal(flow,'expense'))+'.',details:rows.slice(0,5).map(r=>r[0]+' '+usd(r[1]))});}
 if(/\b(cash|bank|money in the bank|funds|liquid)\b/.test(t)&&!/cash sale/.test(t)){
  const rows=['1000','1010','1020','1030'].map(c=>[accountNames[c],accountBalance(asAt,c)] as [string,number]);const sum=rows.reduce((n,r)=>n+cents(r[1]),0)/100;
  return withNote({matched:'cash',tab:'Balance sheet',answer:'Cash and bank as at '+(p.to||today)+' is '+usd(sum)+'.',details:rows.filter(r=>r[1]!==0).map(r=>r[0]+' '+usd(r[1]))});}
 if(/\b(loan|loans|borrow|kembo|director)\b/.test(t)&&/\b(owe|owed|payable|balance|outstanding|how much|total)\b/.test(t)){
  const v=accountBalance(asAt,'2400');return withNote({matched:'loan',tab:'Balance sheet',answer:'The interest-free company loan payable is '+usd(v)+' as at '+(p.to||today)+'.',details:['It is repayable at any time, with no interest.']});}
 if(/\b(owe|liabilit|payables?|debts?)\b/.test(t)&&!/owe us|owes us|owed to us|owing us|customers? owe/.test(t)){
  const rows=chart.filter(a=>a.group==='liability').map(a=>[a.name,accountBalance(asAt,a.code)] as [string,number]).filter(r=>r[1]!==0);
  return withNote({matched:'liabilities',tab:'Balance sheet',answer:'Total liabilities as at '+(p.to||today)+' are '+usd(groupTotal(asAt,'liability'))+'.',details:rows.map(r=>r[0]+' '+usd(r[1]))});}
 if(/\b(assets?)\b/.test(t)){const rows=chart.filter(a=>a.group==='asset').map(a=>[a.name,accountBalance(asAt,a.code)] as [string,number]).filter(r=>r[1]!==0);
  return withNote({matched:'assets',tab:'Balance sheet',answer:'Total assets as at '+(p.to||today)+' are '+usd(groupTotal(asAt,'asset'))+'.',details:rows.map(r=>r[0]+' '+usd(r[1]))});}
 if(/\b(equity|net worth|worth|capital)\b/.test(t)){const eq=groupTotal(asAt,'equity'),earn=(cents(groupTotal(asAt,'income'))-cents(groupTotal(asAt,'expense')))/100;
  return withNote({matched:'equity',tab:'Balance sheet',answer:'Equity as at '+(p.to||today)+' is '+usd((cents(eq)+cents(earn))/100)+'.',details:['Booked equity '+usd(eq),'Unclosed earnings '+usd(earn)]});}
 if(account&&/\b(balance|how much|total|what is|what's|whats)\b/.test(t)){
  const flowType=['income','expense'].includes(groupOf(account)??'');const v=flowType?accountBalance(flow,account):accountBalance(asAt,account);
  return withNote({matched:'account',tab:'General ledger',answer:accountNames[account]+' ('+account+') '+(flowType?'for '+p.label:'as at '+(p.to||today))+' is '+usd(v)+'.'});}
 return null;
}
