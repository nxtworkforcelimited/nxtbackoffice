import type {ReactNode} from 'react';
import Script from 'next/script';
import {businessOsUrl,footerSignature} from '@/lib/public-footer';
import styles from './public-site.module.css';
export default function SiteShell({children}:{children:ReactNode}){
 return <div className={styles.site}>
  <link rel="stylesheet" href="/v6/footer-trace.css"/><Script src="/v6/footer-trace.js" strategy="afterInteractive"/>
  <header className={styles.header}><a className={styles.brand} href="/"><span>NXT</span> WORKFORCE</a><nav><a href="/services">Services</a><a href="/industries">Industries</a><a href="/insights">Insights</a><a href="/about">About</a><a href="/contact">Contact Us</a></nav><div className={styles.headerActions}><a className={styles.primarySmall} href="/domains">Register a domain</a><a className={styles.login} href={businessOsUrl}>Sign in</a><a className={styles.primarySmall} href="/free-audit">Free Audit</a></div></header>
  {children}
  <footer className={styles.footer}><section className={styles.footerSignature} dangerouslySetInnerHTML={{__html:footerSignature}}/><div><a className={styles.brand} href="/"><span>NXT</span> WORKFORCE</a><p>One partner for the whole engine.</p></div><div><strong>Zimbabwe</strong><span>32 Trinity Road, Greendale, Harare</span><span>+263 242 496 172</span></div><div><strong>United Kingdom</strong><span>4 Peppercorn Close, Peterborough, PE1 2DU</span><span>+44 203 750 3296</span></div><div><strong>Contact</strong><a href="mailto:hello@nxt-workforce.com">hello@nxt-workforce.com</a><a href="https://wa.me/263790050483">WhatsApp +263 79 005 0483</a></div></footer>
 </div>
}
