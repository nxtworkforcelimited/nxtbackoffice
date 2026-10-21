import type {BusinessItem} from '@/lib/business';
import {formatMoney} from '@/lib/business';
function date(value:unknown){return typeof value==='string'?value.slice(0,10):'Not recorded';}
export default function PayslipBreakdown({item}:{item:BusinessItem}){
 const p=item.payload,money=(key:string)=>formatMoney(p[key]??0,item.currency);
 return <><section><h3>Pay period</h3><p>Regular salary period: <strong>{date(p.period_start)} to {date(p.period_end)}</strong><br/>Dates paid: <strong>{date(p.paid_from)} to {date(p.paid_to)}</strong><br/>Pay frequency: {p.frequency??'Legacy record'} · Currency: {item.currency}</p>
 {p.payroll_version===2&&<p>Full-period basic salary: {money('contractual_base')}<br/>Calculation: {p.proration_basis==='full'?'Full period':p.proration_basis==='calendar_days'?'Calendar-day proration':'Finance-approved units'} · {Number(p.paid_units)} / {Number(p.period_units)} ({(Number(p.proration_factor)*100).toFixed(2)}%){p.proration_note&&<><br/>Basis: {p.proration_note}</>}</p>}</section>
 <h3>Earnings</h3><dl className="payslip-lines">{[['base','Basic salary earned'],['allowances','Allowances earned'],['overtime','Overtime / commission'],['gross','Gross pay']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{money(key)}</dd></div>)}</dl>
 <h3>Deductions</h3><dl className="payslip-lines">{[['paye','PAYE'],['aids_levy','AIDS levy'],['nssa','NSSA employee contribution'],['other_deductions','Other cash deductions']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{money(key)}</dd></div>)}<div><dt>Total cash deductions</dt><dd>{formatMoney(Number(p.gross??0)-Number(p.net??0),item.currency)}</dd></div><div><dt><strong>Net pay</strong></dt><dd><strong>{money('net')}</strong></dd></div></dl>
 <p className="footnote">Taxable pay: {money('taxable')} · Tax-allowable relief: {money('allowable_deductions')} · Tax credit: {money('tax_credit')}. Relief and credits are shown for explanation and are not additional cash deductions.</p>
 {item.status==='finalised'?<p><strong>Finalised</strong>{p.finalised_at?' on '+date(p.finalised_at):''}. This payslip records approved remuneration; it is not confirmation that a bank payment has been made.</p>:<p><strong>DRAFT — NOT FINALISED.</strong> Payroll administration must review the employee, dates, earnings and deductions before issue.</p>}
 <small>Calculation reference: {p.rules_snapshot?.source??'Not recorded'}</small></>;
}
