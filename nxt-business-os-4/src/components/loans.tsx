'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import type {Workspace} from '@/lib/types';
import {formatMoney} from '@/lib/business';

type Loan={id:string;employee_id:string;employee_name:string;requested_by:string;amount:number;reason:string;status:'requested'|'approved'|'declined'|'deducted';decision_note:string|null;reviewed_at:string|null;deducted_at:string|null;created_at:string;is_mine:boolean;};
export default function Loans({workspace,demo=false}:{workspace:Workspace;demo?:boolean}){
 const [data,setData]=useState<any>({loans:[]}),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[showRequest,setShowRequest]=useState(false),[tab,setTab]=useState<'overview'|'history'|'review'>('overview');
 const base='/api/loans?workspace='+workspace.id;
 const load=useCallback(async()=>{if(demo)return;const r=await fetch(base,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setData(b);},[base,demo]);
 useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function send(v:unknown){const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)}),b=await r.json();if(!r.ok)throw Error(b.error);return b;}
 const loans:Loan[]=data.loans??[],mine=loans.filter(l=>l.is_mine),queue=loans.filter(l=>l.status==='requested'&&!l.is_mine);
 const active=useMemo(()=>mine.find(l=>l.status==='approved')??mine.find(l=>l.status==='requested')??mine[0]??null,[mine]);
 const stats={
  available:Number(data.allowance?.available??0),
  earned:Number(data.allowance?.earned??0),
  used:Number(data.allowance?.used??0),
  pending:mine.filter(l=>l.status==='requested').length,
  approved:mine.filter(l=>l.status==='approved').length,
  deducted:mine.filter(l=>l.status==='deducted').length
 };
 const statusLabel=(s:Loan['status'])=>s==='requested'?'Pending review':s==='approved'?'Approved · next payroll':s==='deducted'?'Deducted':'Declined';
 return <section className="loan-bank-shell">
  <section className="loan-bank-hero">
   <div><span className="eyebrow">EMPLOYEE FINANCE</span><h2>Employee Loans</h2><p>Request, track and manage salary loans in one place.</p></div>
   <div className="loan-bank-actions">{data.employee&&<button className="loan-primary-cta" onClick={()=>setShowRequest(v=>!v)}>{showRequest?'Close request':'Request Loan'}</button>}<span className="loan-access-pill">{data.reviewer?'Reviewer':'Employee'}</span></div>
  </section>

  {error&&<p className="notice error">{error}</p>}{notice&&<p className="notice">{notice}</p>}

  <div className="loan-bank-tabs">
   <button className={tab==='overview'?'active':''} onClick={()=>setTab('overview')}>Overview</button>
   <button className={tab==='history'?'active':''} onClick={()=>setTab('history')}>My Loan History</button>
   {data.reviewer&&<button className={tab==='review'?'active':''} onClick={()=>setTab('review')}>Review Queue <span>{queue.length}</span></button>}
  </div>

  {showRequest&&data.employee&&<section className="loan-request-drawer">
   <div><span className="eyebrow">NEW REQUEST</span><h3>Request a salary loan</h3><p>You can request up to <strong>{formatMoney(stats.available,'USD')}</strong>. The amount is reserved immediately and, if approved, deducted from the next finalised payroll.</p></div>
   <form onSubmit={e=>{e.preventDefault();run(async()=>{await send({action:'request',amount:Number(amount),reason});setAmount('');setReason('');setShowRequest(false);setNotice('Loan request submitted to Bridget, Kristian and Nyasha.');});}}>
    <div className="form-grid"><label>Amount (USD)<input type="number" min="0.01" max={Math.max(stats.available,0)} step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/></label><label>Employee<input readOnly value={data.employee.name}/></label></div>
    <label>Reason<textarea required minLength={5} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Tell the reviewers why you need this loan."/></label>
    <button className="primary" disabled={busy||demo}>Submit request</button>
   </form>
  </section>}

  {!data.employee&&<p className="notice">Your login is not linked to an active employee record, so you can review loans but cannot request one.</p>}

  {tab==='overview'&&<>
   <div className="loan-bank-grid">
    <section className="loan-main-card">
     <div className="loan-main-card-top"><span>{data.employee?.name??'Employee account'}</span><span className={'loan-status-chip '+(active?.status??'none')}>{active?statusLabel(active.status):'Available'}</span></div>
     <div className="loan-main-amount"><small>Available to borrow</small><strong>{formatMoney(stats.available,'USD')}</strong></div>
     {active?<><p>{active.reason} · Current/latest request: {formatMoney(active.amount,'USD')}</p><div className="loan-progress"><span className={['requested','approved','deducted'].includes(active.status)?'done':''}>Requested</span><i/><span className={['approved','deducted'].includes(active.status)?'done':''}>Approved</span><i/><span className={active.status==='deducted'?'done':''}>Payroll</span></div></>:<p>You do not have an active loan request.</p>}
    </section>
    <section className="loan-side-card"><span>Allowance growth</span><h3>+ US$5 every 2 weeks</h3><p>You started with US$20. Your earned allowance grows by US$5 every 14 completed days. Loans you take reduce the available balance.</p><div className="loan-next-rise"><small>Next increase</small><strong>{data.allowance?.next_increase?new Date(data.allowance.next_increase+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'Not available'}</strong></div>{data.employee&&<button className="secondary" disabled={stats.available<=0} onClick={()=>setShowRequest(true)}>Request loan</button>}</section>
   </div>

   <div className="loan-stat-grid">
    <div><span>Available</span><strong>{formatMoney(stats.available,'USD')}</strong><small>Can be requested now</small></div>
    <div><span>Earned allowance</span><strong>{formatMoney(stats.earned,'USD')}</strong><small>US$20 + fortnightly growth</small></div>
    <div><span>Used / reserved</span><strong>{formatMoney(stats.used,'USD')}</strong><small>Pending, approved or deducted</small></div>
    <div><span>Next increase</span><strong>+ US$5</strong><small>{data.allowance?.next_increase??'Every 14 days'}</small></div>
   </div>

   {data.reviewer&&<section className="loan-review-preview panel"><div className="panel-head"><div><span className="eyebrow">REVIEW</span><h3>Requests waiting for you</h3></div><button className="text-button" onClick={()=>setTab('review')}>Open queue</button></div>{queue.slice(0,3).map(l=><div className="loan-review-row" key={l.id}><div><strong>{l.employee_name}</strong><small>{l.reason}</small></div><b>{formatMoney(l.amount,'USD')}</b><span className="badge loan-requested">Pending</span></div>)}{!queue.length&&<p className="empty">No requests are waiting for review.</p>}</section>}
  </>}

  {tab==='history'&&<section className="panel loan-history-panel"><div className="panel-head"><h3>My Loan History</h3><span className="badge">{mine.length}</span></div><div className="table-wrap"><table><thead><tr><th>Amount</th><th>Reason</th><th>Status</th><th>Requested</th></tr></thead><tbody>{mine.map(l=><tr key={l.id}><td><strong>{formatMoney(l.amount,'USD')}</strong></td><td>{l.reason}{l.decision_note&&<small>{l.decision_note}</small>}</td><td><span className={'badge loan-'+l.status}>{statusLabel(l.status)}</span>{l.status==='deducted'&&l.deducted_at&&<small>{new Date(l.deducted_at).toLocaleDateString()}</small>}</td><td>{new Date(l.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>{!mine.length&&<p className="empty">No loan requests yet.</p>}</section>}

  {tab==='review'&&data.reviewer&&<section className="loan-review-dashboard"><div className="loan-review-heading"><div><span className="eyebrow">REVIEW QUEUE</span><h3>Pending employee loan requests</h3><p>Approve or decline requests. Reviewers cannot act on their own loan request.</p></div><span className="loan-queue-count">{queue.length}</span></div>{queue.map(l=><form key={l.id} className="loan-review-bank-card" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),decision=String(f.get('decision')),note=String(f.get('note')??'');run(async()=>{await send({action:'decision',id:l.id,decision,note});setNotice(decision==='approve'?'Loan approved for next payroll deduction.':'Loan declined.');});}}><div className="loan-review-person"><span>{l.employee_name.slice(0,2).toUpperCase()}</span><div><strong>{l.employee_name}</strong><small>{new Date(l.created_at).toLocaleString()}</small></div></div><div className="loan-review-money"><small>Requested amount</small><strong>{formatMoney(l.amount,'USD')}</strong></div><p>{l.reason}</p><label>Decision note<textarea name="note" maxLength={1000} placeholder="Optional note"/></label><div className="action-row"><button className="primary" name="decision" value="approve" disabled={busy}>Approve</button><button className="secondary" name="decision" value="decline" disabled={busy}>Decline</button></div></form>)}{!queue.length&&<div className="loan-empty-state"><strong>Review queue clear</strong><p>No employee loan requests are waiting.</p></div>}</section>}
 </section>;
}
