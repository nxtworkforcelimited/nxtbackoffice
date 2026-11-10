"use client";
import {useState} from 'react';
export default function PasswordSetupForm(){
 const [show,setShow]=useState(false);
 return <form action="/auth/set-password" method="post">
  <label>New password<input required name="password" type={show?'text':'password'} autoComplete="new-password" minLength={12} maxLength={128}/></label>
  <label>Confirm password<input required name="confirm" type={show?'text':'password'} autoComplete="new-password" minLength={12} maxLength={128}/></label>
  <button type="button" aria-pressed={show} onClick={()=>setShow(value=>!value)}>{show?'Hide passwords':'Show passwords'}</button>
  <p>Use at least 12 characters. NXT staff cannot see your password.</p>
  <button className="primary" type="submit">Save password and open portal</button>
 </form>;
}
