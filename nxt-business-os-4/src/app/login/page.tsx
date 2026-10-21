import {configured} from '@/lib/supabase/server';
import LoginForm from './login-form';
import styles from './login.module.css';

export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const error=(await searchParams).error;
  return <main className={styles.shell}>
    <section className={styles.visual} aria-label="NXT Workforce">
      <div className={styles.visualShade}/>
      <div className={styles.visualCopy}>
        <p className={styles.kicker}>ONE WORKSPACE. EVERY POSSIBILITY.</p>
        <h1>The whole business.<br/>Moving together.</h1>
        <p>Your clients, your people and your next big idea.<br/>A connected workspace built for NXT Workforce.</p>
      </div>
    </section>

    <section className={styles.panel}>
      <span className={styles.pageNumber} aria-hidden="true">01</span>
      <div className={styles.formWrap}>
        <img className={styles.logo} src="/brand/nxt-business-os.png" alt="NXT Business OS"/>
        <div className={styles.intro}>
          <p className={styles.welcome}>WELCOME TO NXT</p>
          <h2>Let’s get to work.</h2>
          <p>Sign in to your portal</p>
        </div>
        <LoginForm ready={configured()} error={error}/>
      </div>
      <footer>NXT Workforce Limited <span>·</span> Built for what’s next</footer>
    </section>
  </main>;
}
