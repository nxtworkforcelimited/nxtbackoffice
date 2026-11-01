const menu = `<details class="nxt-services-menu">
  <summary>Services <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></summary>
  <div class="nxt-services-panel">
    <p>Explore our services</p>
    <a href="/services#marketing">Marketing &amp; branding</a>
    <a href="/services#web-systems">Websites, CRM &amp; back offices</a>
    <a href="/services#sales-support">Sales &amp; customer support</a>
    <a href="/services#operations-data">Operations &amp; data management</a>
    <a href="/services/ai-integration">AI &amp; automation</a>
    <a href="/services/whatsapp-business">WhatsApp &amp; messaging</a>
    <a href="/domains">Domain registration</a>
    <a class="nxt-browse-all" href="/services#service-directory">Browse all services <span aria-hidden="true">→</span></a>
    <a class="nxt-adviser-link" href="/#services" data-open-adviser>Help me choose · Ask AI <span aria-hidden="true">✧</span></a>
  </div>
</details>`;

export function withServicesMenu(html: string): string {
  if (html.includes('class="nxt-services-menu"')) return html;
  return html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/, header => {
    if (!/<button class="(?:site-menu|menu-toggle)"/.test(header)) return header;
    return header.replace(/<a href="\/services(?:\.html)?">(?:Our services|Services)<\/a>/i, '')
      .replace(/<button class="(?:site-menu|menu-toggle)"/, start => menu + start);
  }).replace('</head>', '<link rel="stylesheet" href="/v6/services-menu.css"><script defer src="/v6/services-menu.js"></script></head>');
}
