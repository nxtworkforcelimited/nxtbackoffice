// All links in these menus are company-owned destinations or links within the website.
type NavLink = readonly [string, string];
const aboutLinks: NavLink[] = [
  ['Company overview', '/about'], ['Why NXT', '/#why'],
  ['Our Vision and Mission', '/about#vision-and-mission'],
  ['Our Clients', '/#clients'], ['Free audit', '/free-audits#audit-form'],
];
const serviceLinks: NavLink[] = [
  ['Marketing &amp; branding', '/services#marketing'],
  ['Websites, CRM &amp; back offices', '/services#web-systems'],
  ['Sales &amp; customer support', '/services#sales-support'],
  ['Operations &amp; data management', '/services#operations-data'],
  ['SME packages', '/services#sme'], ['AI &amp; automation', '/services/ai-integration'],
  ['WhatsApp &amp; messaging', '/services/whatsapp-business'], ['Domain registration', '/domains'],
  ['Browse all services', '/services#service-directory'],
];
const articleLinks: NavLink[] = [['News', '/insights?view=news#industry-news'], ['Blogs', '/blog']];
const sectorLinks: NavLink[] = [
  ['SMEs &amp; entrepreneurs','smes-entrepreneurs'], ['Property &amp; real estate','property-real-estate'],
  ['Mining','mining'], ['Agriculture','agriculture'], ['Financial services','financial-services'],
  ['Travel &amp; hospitality','travel-hospitality'], ['Healthcare','healthcare'],
];
const chevron = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function dropdown(label: string, links: NavLink[], extra = '') {
  return `<details class="nxt-nav-disclosure" name="nxt-primary"><summary>${label}${chevron}</summary>
    <div class="nxt-nav-panel">${links.map(([name, url]) => `<a href="${url}">${name}</a>`).join('')}${extra}</div>
  </details>`;
}

export function publicNavigation(brand: string, showSearch = false) {
  const search = showSearch ? '<button id="searchToggle" type="button" aria-label="Search the NXT Workforce website"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg></button>' : '';
  return `<nav class="nxt-global-nav" aria-label="Main navigation">
    <div class="nxt-utility"><a href="/contact">Contact us</a><a href="https://nxt-business-os.vercel.app/app">Client login</a><a class="nxt-utility-audit" href="/free-audits#audit-form">Free audit</a><a class="nxt-domain-link" href="/domains">Register a domain</a>${search}</div>
    <div class="nxt-nav-row">
      <div class="nxt-nav-side nxt-nav-left"><a class="nxt-nav-direct" href="/">Home</a>${dropdown('About Us', aboutLinks)}${dropdown('Services', serviceLinks, '<a class="nxt-adviser-link" data-open-adviser href="/#services">Help me choose · Ask AI</a>')}</div>
      <a class="nxt-nav-brand" href="/" aria-label="NXT Workforce home">${brand}</a>
      <div class="nxt-nav-side nxt-nav-right">${dropdown('Articles', articleLinks)}<a class="nxt-nav-direct" href="/industries">Who We Serve</a></div>
    </div>
  </nav>`;
}

// Company profile, page 3.
export const visionAndMission = `<section class="nxt-purpose" id="vision-and-mission" aria-labelledby="nxt-purpose-title">
  <h2 id="nxt-purpose-title">Our vision and mission</h2>
  <div><article><h3>Our vision</h3><p>For every brand to be heard and seen as exactly what it is: a true force in its market, with nothing lost between the message and the customer.</p></article>
  <article><h3>Our mission</h3><p>To bring better technology and better services to every business. Services that are properly run, properly staffed and built to bring results.</p></article></div>
</section>`;

function sectorHero(brand: string) {
  const links = sectorLinks.map(([label, slug], i) =>
    `<a class="nxt-sector-node sector-${i+1}" href="/who-we-serve/${slug}">${label}</a>`).join('');
  return `<section class="nxt-sector-hero" aria-labelledby="nxt-sectors-title">
    <h1 id="nxt-sectors-title">Who we serve</h1>
    <p>Choose your sector to see how NXT can support your business.</p>
    <div class="nxt-sector-map" role="group" aria-label="Explore seven sectors">
      <div class="nxt-sector-centre" aria-hidden="true">${brand.replaceAll('header-x-shape', 'sector-x-shape')}</div>
      ${links}
    </div>
  </section>`;
}

export function withServicesMenu(html: string, brand: string, page: string): string {
  const header = '<header class="nxt-global-header">' + publicNavigation(brand, html.includes('id="siteSearchOverlay"')) + '</header>';
  html = html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/, () => header);
  html = html.replace(/<link rel="stylesheet" href="\/v6\/services-menu\.css(?:\?[^"]*)?">/g, '')
    .replace(/<script defer src="\/v6\/services-menu\.js(?:\?[^"]*)?"><\/script>/g, '')
    .replace('</head>', '<link rel="stylesheet" href="/v6/services-menu.css?v=3"><script defer src="/v6/services-menu.js?v=2"></script></head>');
  const route = page.replace(/^\//, '').replace(/\.html$/, '');
  if (route === 'insights' && !html.includes('id="industry-news"')) {
    html = html.replace('data-news-card="News"', 'id="industry-news" data-news-card="News"');
  }
  if (route === 'about' && !html.includes('id="vision-and-mission"')) {
    html = html.replace('<section class="split content-section">', visionAndMission + '<section class="split content-section">');
  }
  if (route === 'industries' || route === 'who-we-serve') {
    html = html.replace(/(<main>\s*)<section class="(?:service-page-hero|nxt-sector-hero)"[^>]*>[\s\S]*?<\/section>/, (_section, main) => main + sectorHero(brand));
  }
  // The supplementary static pages also promote Business OS in their footer.
  return html.replaceAll('<h2>A CRM built for Africa.</h2><a href="https://nxt-business-os.vercel.app/app">Open NXT Business OS</a>', '<h2>A CRM built for Africa.</h2><p>Coming 1 January 2027</p><a href="/#crm-waiting-list">Join the waiting list</a>');
}
