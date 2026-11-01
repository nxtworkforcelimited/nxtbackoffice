import type {ReactNode} from 'react';
import Script from 'next/script';
import {footerSignature,headerBrand} from '@/lib/public-footer';
import {publicNavigation} from '@/lib/public-services-menu';
import styles from './public-site.module.css';
export default function SiteShell({children}:{children:ReactNode}){
 return <div className={styles.site}>
  <link rel="stylesheet" href="/v6/footer-trace.css"/><Script src="/v6/footer-trace.js" strategy="afterInteractive"/>
  <link rel="stylesheet" href="/v6/services-menu.css?v=3"/><Script src="/v6/services-menu.js?v=2" strategy="afterInteractive"/>
  <header className="nxt-global-header" dangerouslySetInnerHTML={{__html:publicNavigation(headerBrand)}}/>
  {children}
  <footer className={styles.footer}><section className={styles.footerSignature} dangerouslySetInnerHTML={{__html:footerSignature}}/><div><a className={styles.brand} href="/"><span>NXT</span> WORKFORCE</a><p>One partner for the whole engine.</p></div><div><strong>Zimbabwe</strong><span>32 Trinity Road, Greendale, Harare</span><span>+263 242 496 172</span></div><div><strong>United Kingdom</strong><span>4 Peppercorn Close, Peterborough, PE1 2DU</span><span>+44 203 750 3296</span></div><div><strong>Contact</strong><a href="mailto:hello@nxt-workforce.com">hello@nxt-workforce.com</a><a href="https://wa.me/263790050483">WhatsApp +263 79 005 0483</a></div></footer>
 </div>
}
