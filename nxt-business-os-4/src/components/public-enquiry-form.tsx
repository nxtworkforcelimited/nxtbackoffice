'use client';
import {useState,type FormEvent} from 'react';
import styles from './public-site.module.css';
export default function PublicEnquiryForm({type='enquiry'}:{type?:'enquiry'|'free_audit'}){
 const [state,setState]=useState<'idle'|'sending'|'sent'|'error'>('idle');
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setState('sending');const form=e.currentTarget;const data=Object.fromEntries(new FormData(form).entries());
  const r=await fetch('/api/public/enquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,type})});
  if(r.ok){form.reset();setState('sent');}else setState('error');
 }
 return <form className={styles.form} onSubmit={submit}>
  <div className={styles.formGrid}><label>Name<input name="name" required maxLength={120}/></label><label>Company<input name="company" maxLength={160}/></label><label>Email<input name="email" type="email" required maxLength={254}/></label><label>Phone<input name="phone" maxLength={60}/></label></div>
  {type==='free_audit'?<label>Audit type<select name="audit_type" required><option value="">Choose an audit</option><option>Website Audit</option><option>SEO & Google Audit</option><option>Social Media Audit</option><option>Customer Experience Audit</option><option>Sales Follow-Up Audit</option><option>Digital Presence Audit</option></select></label>:<label>Service area<input name="service" maxLength={160} placeholder="What can we help with?"/></label>}
  <label>Industry<input name="industry" maxLength={160}/></label><label>{type==='free_audit'?'Biggest concern':'Tell us what you need'}<textarea name="message" required maxLength={4000} rows={6}/></label>
  <input className={styles.honeypot} name="website" tabIndex={-1} autoComplete="off"/>
  <button className={styles.primary} disabled={state==='sending'}>{state==='sending'?'Sending…':type==='free_audit'?'Request My Free Audit':'Send Enquiry'}</button>
  {state==='sent'&&<p className={styles.success}>Thank you. We’ve received your {type==='free_audit'?'free audit request':'enquiry'} and our team will respond within 24 hours.</p>}
  {state==='error'&&<p className={styles.error}>We could not submit this form. Please email hello@nxt-workforce.com or WhatsApp +263 79 005 0483.</p>}
 </form>
}
