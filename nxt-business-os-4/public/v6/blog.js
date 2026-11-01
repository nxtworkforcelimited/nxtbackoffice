(() => {
  const cards = document.querySelector('[data-journal-cards]');
  const reader = document.querySelector('#journal-reader');
  if (!cards && !reader) return;
  const endpoint = 'https://cbcgpxtlxqmuzhxkutso.supabase.co/rest/v1/nxt_website_posts';
  const publicKey = 'sb_publishable_RYpkY8vkkmcDPmxv2w6WVQ_c_vww3CD';
  const slug = reader ? new URLSearchParams(location.search).get('article') : null;

  async function published(fields, extra = {}) {
    const url = new URL(endpoint);
    const query = {select:fields, published:'eq.true', ...extra};
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key,value);
    const res = await fetch(url, {headers:{apikey:publicKey},signal:AbortSignal.timeout(10000)});
    if (!res.ok) throw new Error('Could not load articles');
    return res.json();
  }
  function node(tag, text, cls) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = text;
    return el;
  }
  function articleLink(item,text,cls) {
    const anchor = node('a',text,cls);
    anchor.href = '/blog?article=' + encodeURIComponent(item.slug);
    return anchor;
  }
  function card(item,index) {
    const block = document.createElement('article');
    block.className = 'journal-card';
    const heading = document.createElement('h3');
    heading.append(articleLink(item,item.title));
    block.append(node('span',String(index+1).padStart(2,'0'),'journal-index'),node('span',item.category,'kicker'),heading,node('p',item.excerpt),articleLink(item,'Read article','svc-action'));
    return block;
  }
  if (!slug) {
    published('slug,title,category,excerpt',{order:'created_at.desc',limit:reader?'100':'3'}).then(items => {
      if (!items.length) cards.replaceChildren(node('p','New articles will appear here once published.'));
      else cards.replaceChildren(...items.map(card));
    }).catch(() => { /* The rendered list remains available when the live feed is offline. */ });
    return;
  }
  reader.hidden = false;
  document.querySelector('.journal-page .page-hero').hidden = true;
  document.querySelector('#journal-list').hidden = true;
  const story = reader.querySelector('[data-journal-story]');
  story.textContent = 'Loading article…';
  published('slug,title,category,excerpt,body',{slug:'eq.'+slug,limit:'1'}).then(items => {
    if (!items.length) { story.replaceChildren(node('h1','Article unavailable'),node('p','Choose another published article from the blog.')); return; }
    const item = items[0];document.title = item.title + ' | NXT Workforce';
    const paragraphs = String(item.body || '').split(/\n\s*\n/).filter(Boolean).map(p=>node('p',p,'journal-paragraph'));
    story.replaceChildren(node('span',item.category,'kicker'),node('h1',item.title),node('p',item.excerpt,'journal-intro'),...paragraphs);
  }).catch(() => { story.replaceChildren(node('h1','Article temporarily unavailable'),node('p','Please reload this page or browse the other articles.')); });
})();
