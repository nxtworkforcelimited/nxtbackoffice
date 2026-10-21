'use client';
import {useEffect,useState} from 'react';
const dateString=(d:Date)=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
function bounds(value:string,frequency:string){const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(d.getTime()))return [value,value];if(frequency==='monthly'){d.setUTCDate(1);const end=new Date(d);end.setUTCMonth(end.getUTCMonth()+1,0);return [dateString(d),dateString(end)];}const end=new Date(d);end.setUTCDate(end.getUTCDate()+(frequency==='weekly'?6:frequency==='fortnightly'?13:0));return [dateString(d),dateString(end)];}
function dayCount(start:string,end:string){return Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000)+1;}
export default function PayrollPeriod(){
 const [requestId,setRequestId]=useState(''),[frequency,setFrequency]=useState('monthly'),[basis,setBasis]=useState('full');
 const initial=bounds(dateString(new Date()),'monthly');
 const [start,setStart]=useState(initial[0]),[end,setEnd]=useState(initial[1]),[paidFrom,setPaidFrom]=useState(initial[0]),[paidTo,setPaidTo]=useState(initial[1]),[paidUnits,setPaidUnits]=useState(''),[periodUnits,setPeriodUnits]=useState('');
 useEffect(()=>setRequestId(crypto.randomUUID()),[]);
 function changePeriod(value:string,f=frequency){const [s,e]=bounds(value,f);setStart(s);setEnd(e);setPaidFrom(s);setPaidTo(e);}
 const numerator=basis==='manual_units'?Number(paidUnits):dayCount(paidFrom,paidTo),denominator=basis==='manual_units'?Number(periodUnits):dayCount(start,end);
 const valid=Number.isFinite(numerator)&&Number.isFinite(denominator)&&numerator>0&&denominator>0&&numerator<=denominator&&paidFrom>=start&&paidTo<=end&&paidFrom<=paidTo;
 return <section className="panel payroll-period"><h3>Pay period and proration</h3><input type="hidden" name="request_id" value={requestId}/><div className="form-grid">
  <label>Pay frequency<select name="frequency" value={frequency} onChange={e=>{setFrequency(e.target.value);changePeriod(start,e.target.value);}}>{['monthly','weekly','fortnightly','daily'].map(f=><option key={f} value={f}>{f[0].toUpperCase()+f.slice(1)}</option>)}</select></label>
  <label>Salary calculation<select name="proration_basis" value={basis} onChange={e=>{setBasis(e.target.value);if(e.target.value==='full'){setPaidFrom(start);setPaidTo(end);}}}><option value="full">Full period — no proration</option><option value="calendar_days">Prorated — calendar days</option><option value="manual_units">Prorated — approved days / hours</option></select></label>
  <label>Regular salary period: from<input type="date" name="period_start" required value={start} onChange={e=>changePeriod(e.target.value)}/></label>
  <label>Regular salary period: to<input type="date" name="period_end" required value={end} min={start} onChange={e=>{setEnd(e.target.value);if(basis==='full')setPaidTo(e.target.value);}}/></label>
  <label>Dates actually paid: from<input type="date" name="paid_from" required min={start} max={end} readOnly={basis==='full'} value={paidFrom} onChange={e=>setPaidFrom(e.target.value)}/></label>
  <label>Dates actually paid: to<input type="date" name="paid_to" required min={paidFrom} max={end} readOnly={basis==='full'} value={paidTo} onChange={e=>setPaidTo(e.target.value)}/></label>
  {basis==='manual_units'&&<><label>Paid working days / hours<input name="paid_units" type="number" min="0.01" max="10000" step="0.01" required value={paidUnits} onChange={e=>setPaidUnits(e.target.value)}/></label><label>Working days / hours in full period<input name="period_units" type="number" min="0.01" max="10000" step="0.01" required value={periodUnits} onChange={e=>setPeriodUnits(e.target.value)}/></label></>}
 </div>{basis!=='full'&&<label>Proration basis / reason<textarea name="proration_note" maxLength={1000} minLength={basis==='manual_units'?10:undefined} required={basis==='manual_units'} placeholder="For example: started part-way through the month; approved working days exclude the agreed holidays."/></label>}
 <p className="notice">{valid?`Basic salary × ${numerator} ÷ ${denominator} = ${(numerator/denominator*100).toFixed(2)}% of full-period basic salary.`:'Check the selected dates and proration units.'} Dates are inclusive. Select the method approved for this employee.</p>
 <p>Enter the contracted basic salary for the full regular period below. Allowances, overtime and deductions must be the actual amounts for the paid period; they are not automatically prorated. Finance must verify tax tables for this frequency and approve partial-period tax/NSSA treatment.</p></section>;
}
