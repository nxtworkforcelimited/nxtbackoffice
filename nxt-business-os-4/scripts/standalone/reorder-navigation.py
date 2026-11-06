from pathlib import Path
import re,json,sys
src=Path(sys.argv[1]);out=src
for p in src.rglob('*.html'):
 html=p.read_text()
 match=re.search(r'<header\b[^>]*>[\s\S]*?</header>',html);assert match,p
 old=match.group()
 brand=re.search(r'<a class="nxt-nav-brand"[\s\S]*?</a>',old).group()
 drops=re.findall(r'<details class="nxt-nav-disclosure"[\s\S]*?</details>',old);assert len(drops)==3,p
 about=re.sub(r'<a[^>]+href="/free-audits[^\"]*"[^>]*>[\s\S]*?</a>','',drops[0])
 search=re.search(r'<button id="searchToggle"[\s\S]*?</button>',old)
 header='<header class="nxt-global-header"><nav class="nxt-global-nav" aria-label="Main navigation">'+brand+'<div class="nxt-utility"><a href="https://nxt-workforce.com/os">Login</a><a class="nxt-domain-link" href="/domains">Register a domain</a>'+(search.group() if search else '')+'</div><div class="nxt-nav-row"><a class="nxt-nav-direct" href="/">Home</a>'+about+drops[1]+drops[2]+'<a class="nxt-nav-direct" href="/industries">Who We Serve</a><a class="nxt-nav-direct" href="/contact">Contact Us</a></div></nav></header>'
 html=html[:match.start()]+header+html[match.end():]
 html=re.sub(r'/v6/services-menu.css(?:\?[^\"]*)?', '/v6/services-menu.css?v=4',html)
 html=re.sub(r'/v6/services-menu.js(?:\?[^\"]*)?', '/v6/services-menu.js?v=3',html)
 dest=out/p.relative_to(src);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(html)
 assert 'Free audit' not in header and header.count('>Login<')==1
 assert [re.sub('<[^>]+>','',x).strip() for x in re.findall(r'<summary>(.*?)</summary>',header)]==['About Us','Services','Articles']
