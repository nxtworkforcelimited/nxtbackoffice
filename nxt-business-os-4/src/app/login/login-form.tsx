'use client';

import {useEffect,useState} from 'react';
import styles from './login.module.css';

export default function LoginForm({ready,error}:{ready:boolean;error?:string}) {
  const [show,setShow]=useState(false);
  useEffect(()=>{if(error&&window.location.search)window.history.replaceState({},'',window.location.pathname);},[error]);
  const linkExpired=Boolean(error&&(/expired|already used|password-setup|setup session/i.test(error)));
  if(!ready) return <p className={styles.notice}>NXT Business OS is temporarily unavailable. Please contact your workspace administrator.</p>;

  return <>
    {error&&<p role="alert" className={styles.notice}>{linkExpired?'That setup/reset link has expired or was already used. If you already have a password, sign in below. If you do not know your password, ask NXT Workforce to send a fresh reset link.':error}</p>}
    <form action="/auth/login" method="post" className={styles.form}>
      <label>Email address
        <input name="email" type="email" autoComplete="username" required/>
      </label>
      <label>Password
        <span className={styles.passwordField}>
          <input name="password" type={show?'text':'password'} autoComplete="current-password" required/>
          <button type="button" className={styles.eye} aria-label={show?'Hide password':'Show password'} aria-pressed={show} onClick={()=>setShow(v=>!v)}>
            {show
              ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.6 10.6 0 0 1 12 4c5.5 0 9 6 9 6a16.7 16.7 0 0 1-2.1 2.7M6.6 6.6C4.3 8 3 10 3 10s3.5 6 9 6c1.4 0 2.6-.4 3.7-.9"/></svg>
              : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Zm9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></svg>}
          </button>
        </span>
      </label>
      <button className={styles.submit}>Sign in <span aria-hidden="true">→</span></button>
    </form>
    <a className={styles.forgot} href="mailto:hello@nxt-workforce.com?subject=NXT%20Business%20OS%20password%20reset">Forgot password?</a>
  </>;
}
