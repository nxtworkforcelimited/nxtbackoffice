'use client';
import {useEffect} from 'react';
/** Legacy prepare button forwards to the current dated calculator rather than maintaining two calculation forms. */
export default function PayrollPeriod(){useEffect(()=>{window.location.assign('/app/payroll'+window.location.search);},[]);return <section><p>Opening the updated payroll calculator with US$5/hour overtime, PAYE and leave balances…</p><a href="/app/payroll">Open payroll calculator</a></section>;}
