'use client';
import {useState} from 'react';
import {Download,FilePlus2,MessageSquare,Send} from 'lucide-react';
import {chart,accountNames} from '@/lib/accounting';
import {answerQuestion,entryLines,entryTypes,ledgerRows,parseJournalCsv,toCsv,usd,type DraftLite,type EntryTypeKey,type JEntry,type JLine} from '@/lib/accounting-tools';
export type NewEntry={entry_date:string;description:string;lines:JLine[]};
const examples=['What is our profit this year?','How much cash do we have?','What do we owe on the company loan?','Is the trial balance balanced?','How much did we spend on rent?','What is waiting for approval?','Where do I find the balance sheet?'];
type Item={q:string;answer:string;details?:string[];tab?:string;basis:string;error?:boolean};
function download(name:string,rows:unknown[][]){const url=URL.createObjectURL(new Blob([toCsv(rows)],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}

export function AskPanel({workspace,journals,drafts,today,openTab}:{workspace:string;journals:JEntry[];drafts:DraftLite[];today:string;openTab:(tab:string)=>void}){
 const [q,setQ]=useState(''),[items,setItems]=useState<Item[]>([]),[busy,setBusy]=useState(false);
 async function ask(text:string){
  const question=text.trim();if(!question||busy)return;setQ('');
  const local=answerQuestion(question,journals,drafts,today);
  if(local){setItems(v=>[{q:question,answer:local.answer,details:local.details,tab:local.tab,basis:'Worked out from your posted journals'},...v]);return;}
  setBusy(true);
  try{const r=await fetch('/api/accounting/ask?workspace='+workspace,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question})});const b=await r.json();
   setItems(v=>[{q:question,answer:r.ok?b.answer:b.error,basis:r.ok?b.basis:'',error:!r.ok},...v]);}
  catch{setItems(v=>[{q:question,answer:'Could not reach the assistant. Please try again.',basis:'',error:true},...v]);}
  finally{setBusy(false);}
 }
 return <section className="panel accounting-ask"><h2><MessageSquare size={20}/> Ask about the books</h2>
  <p>Type any accounting question. Profit, revenue, expenses, cash, loans, balances, journals and what is waiting for approval are answered directly from your posted journals. Unposted drafts are never counted.</p>
  <form className="accounting-ask-form" onSubmit={e=>{e.preventDefault();ask(q);}}><input aria-label="Your accounting question" maxLength={1000} placeholder="For example: what was our profit in October?" value={q} onChange={e=>setQ(e.target.value)}/><button className="primary" disabled={busy||!q.trim()}><Send size={16}/> {busy?'Thinking':'Ask'}</button></form>
  <div className="accounting-ask-chips">{examples.map(x=><button type="button" key={x} onClick={()=>ask(x)}>{x}</button>)}</div>
  <div className="accounting-ask-list" aria-live="polite">{items.map((it,i)=><article key={i} className={'accounting-ask-item'+(it.error?' error':'')}><p className="accounting-ask-q">{it.q}</p><p className="accounting-ask-a">{it.answer}</p>{it.details&&it.details.length>0&&<ul>{it.details.map((d,k)=><li key={k}>{d}</li>)}</ul>}<div className="accounting-ask-foot">{it.basis&&<span>{it.basis}</span>}{it.tab&&<button type="button" onClick={()=>openTab(it.tab!)}>Open {it.tab}</button>}</div></article>)}</div>
 </section>;
}

export function LedgerPanel({journals,from,to}:{journals:JEntry[];from:string;to:string}){
 const [code,setCode]=useState('1000');const g=ledgerRows(journals,code,from,to);
 return <section className="panel accounting-ledger"><h2>General ledger</h2><p>Every posted line for one account, with a running balance. Choose the period with the From and To dates above.</p>
  <div className="action-row no-print"><label>Account<select value={code} onChange={e=>setCode(e.target.value)}>{chart.map(a=><option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></label><button onClick={()=>download('NXT-ledger-'+code+'.csv',[['Date','Description','Debit','Credit','Balance'],['','Opening balance','','',g.opening],...g.rows.map(r=>[r.date,r.description,r.debit,r.credit,r.balance]),['','Closing balance','','',g.closing]])}><Download size={15}/> Download ledger CSV</button></div>
  <div className="accounting-metrics"><div><span>Opening</span><strong>{usd(g.opening)}</strong></div><div><span>Closing</span><strong>{usd(g.closing)}</strong></div><div><span>Lines</span><strong>{g.rows.length}</strong></div></div>
  <div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody><tr><td/><td><strong>Opening balance</strong></td><td/><td/><td>{usd(g.opening)}</td></tr>{g.rows.map((r,i)=><tr key={i}><td>{r.date}</td><td>{r.description}</td><td>{r.debit?usd(r.debit):''}</td><td>{r.credit?usd(r.credit):''}</td><td>{usd(r.balance)}</td></tr>)}<tr className="financial-total"><td/><td><strong>Closing balance · {accountNames[code]}</strong></td><td/><td/><td>{usd(g.closing)}</td></tr></tbody></table></div>
  {!g.rows.length&&<p>No posted lines for this account in the period.</p>}</section>;
}

const sample='date,description,account,debit,credit,entry\n2026-09-23,DELL LAPTOP 001,1400,440,0,1\n2026-09-23,DELL LAPTOP 001,1000,0,440,1';
export function EntryPanel({busy,progress,onSave}:{busy:boolean;progress:string;onSave:(entries:NewEntry[])=>Promise<boolean>}){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Harare'}).format(new Date());
 const [type,setType]=useState<EntryTypeKey>('loan'),[date,setDate]=useState(today),[desc,setDesc]=useState(''),[amount,setAmount]=useState(''),[text,setText]=useState('');
 const t=entryTypes.find(x=>x.key===type)!;const lines=entryLines(type,Number(amount));const parsed=text.trim()?parseJournalCsv(text):null;
 return <section className="accounting-entry-grid">
  <article className="panel people-form"><h2><FilePlus2 size={19}/> Quick entry</h2><p>Pick what happened, enter the amount, and the debit and credit accounts are filled in. It goes to the Review queue as a draft, so nothing changes in the reports until it is approved and posted.</p>
   <fieldset disabled={busy}><label>What happened<select value={type} onChange={e=>setType(e.target.value as EntryTypeKey)}>{entryTypes.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
   <label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
   <label>Description<input maxLength={300} value={desc} placeholder={t.label} onChange={e=>setDesc(e.target.value)}/></label>
   <label>Amount (USD)<input type="number" min="0.01" step="0.01" value={amount} placeholder="Enter the amount" onChange={e=>setAmount(e.target.value)}/></label></fieldset>
   {lines&&<p className="accounting-entry-preview">Debit {t.debit} · {accountNames[t.debit]}<br/>Credit {t.credit} · {accountNames[t.credit]}<br/>Amount {usd(Number(amount))}</p>}
   <button className="primary" disabled={busy||!lines||!date} onClick={()=>onSave([{entry_date:date,description:(desc.trim()||t.label).slice(0,300),lines:lines!}]).then(ok=>{if(ok){setDesc('');setAmount('');}})}>Add to Review queue</button></article>
  <article className="panel people-form"><h2>Import journals</h2><p>Paste rows exported from Odoo or a spreadsheet: date, description, account code, debit, credit. Add an optional sixth column to group lines into one entry. Every entry must balance. They are added as drafts for approval.</p>
   <textarea aria-label="Journal rows to import" rows={8} value={text} placeholder={sample} onChange={e=>setText(e.target.value)} disabled={busy}/>
   <div className="action-row"><button type="button" onClick={()=>setText(sample)}>Use example</button><button type="button" onClick={()=>download('NXT-journal-import-template.csv',sample.split('\n').map(r=>r.split(',')))}><Download size={15}/> Download template</button></div>
   {parsed&&<div className={parsed.errors.length?'notice error':'notice'} role="status"><strong>{parsed.entries.length} entr{parsed.entries.length===1?'y':'ies'} ready.</strong>{parsed.errors.length>0&&<ul>{parsed.errors.slice(0,8).map((e,i)=><li key={i}>{e}</li>)}</ul>}{parsed.errors.length>8&&<p>and {parsed.errors.length-8} more problems.</p>}</div>}
   <button className="primary" disabled={busy||!parsed||!parsed.entries.length||parsed.errors.length>0} onClick={()=>onSave(parsed!.entries).then(ok=>{if(ok)setText('');})}>Add {parsed?.entries.length??0} to Review queue</button>
   {progress&&<p role="status">{progress}</p>}</article>
 </section>;
}
