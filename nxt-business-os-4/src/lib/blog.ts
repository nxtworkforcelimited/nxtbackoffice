// Blog helpers: URL slugs, a safe Markdown subset, the heading outline and the SEO checklist.
// Everything is escaped before it becomes HTML, and links and image addresses are restricted, so post text can never inject scripts.

export function slugify(input:string,max=70){
 const s=String(input??'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/&/g,' and ').replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
 if(s.length<=max)return s;
 const cut=s.slice(0,max),i=cut.lastIndexOf('-');
 return (i>20?cut.slice(0,i):cut).replace(/-+$/,'');
}
export const validSlug=(s:string)=>/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)&&s.length<=90;

const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
/** Only web addresses, site-relative paths and mail links are allowed. Anything else (javascript:, data:) becomes nothing. */
export function safeUrl(u:string,image=false){
 const v=String(u??'').trim();
 if(/^https?:\/\/[^\s"'<>]+$/i.test(v))return v;
 if(/^\/(?!\/)[^\s"'<>]*$/.test(v))return v;
 if(!image&&/^mailto:[^\s"'<>]+$/i.test(v))return v;
 return '';
}
const isExternal=(u:string)=>/^https?:\/\//i.test(u);

function inline(text:string){
 // Order: pull out code, then images and links, escape the rest, then bold and italic.
 const keep:string[]=[];
 const stash=(html:string)=>{keep.push(html);return '\u0000'+(keep.length-1)+'\u0000';};
 let t=text.replace(/`([^`]+)`/g,(_,c)=>stash('<code>'+esc(c)+'</code>'));
 t=t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,(_,alt,url)=>{const u=safeUrl(url,true);return u?stash('<img src="'+esc(u)+'" alt="'+esc(alt)+'" loading="lazy">'):esc(alt);});
 t=t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(_,label,url)=>{const u=safeUrl(url);return u?stash('<a href="'+esc(u)+'"'+(isExternal(u)?' rel="noopener noreferrer" target="_blank"':'')+'>'+esc(label)+'</a>'):esc(label);});
 t=esc(t).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>');
 return t.replace(/\u0000(\d+)\u0000/g,(_,i)=>keep[Number(i)]);
}

export type Heading={level:2|3;text:string;id:string};
const plain=(s:string)=>s.replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`]/g,'').trim();

/** Headings in the body. A stray "# " in the body is treated as H2, because the page already has its one H1. */
export function outline(md:string):Heading[]{
 const out:Heading[]=[],used=new Map<string,number>();
 for(const raw of String(md??'').split('\n')){
  const m=raw.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);if(!m)continue;
  const text=plain(m[2]),base=slugify(text,60)||'section',n=used.get(base)??0;used.set(base,n+1);
  out.push({level:m[1].length===3?3:2,text,id:n?base+'-'+(n+1):base});
 }
 return out;
}
export function bodyHasH1(md:string){return /^#\s+\S/m.test(String(md??''));}

export function renderMarkdown(md:string):string{
 const lines=String(md??'').replace(/\r\n?/g,'\n').split('\n'),html:string[]=[],heads=outline(md);let h=0,i=0;
 while(i<lines.length){
  const line=lines[i];
  if(!line.trim()){i++;continue;}
  const hm=line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
  if(hm){const hd=heads[h++],lvl=hm[1].length===3?3:2;html.push('<h'+lvl+' id="'+esc(hd.id)+'">'+inline(hm[2])+'</h'+lvl+'>');i++;continue;}
  if(/^(-{3,}|\*{3,})\s*$/.test(line)){html.push('<hr>');i++;continue;}
  if(/^>\s?/.test(line)){const q:string[]=[];while(i<lines.length&&/^>\s?/.test(lines[i])){q.push(lines[i].replace(/^>\s?/,''));i++;}html.push('<blockquote><p>'+inline(q.join(' '))+'</p></blockquote>');continue;}
  if(/^\s*[-*]\s+/.test(line)){const li:string[]=[];while(i<lines.length&&/^\s*[-*]\s+/.test(lines[i])){li.push('<li>'+inline(lines[i].replace(/^\s*[-*]\s+/,''))+'</li>');i++;}html.push('<ul>'+li.join('')+'</ul>');continue;}
  if(/^\s*\d+[.)]\s+/.test(line)){const li:string[]=[];while(i<lines.length&&/^\s*\d+[.)]\s+/.test(lines[i])){li.push('<li>'+inline(lines[i].replace(/^\s*\d+[.)]\s+/,''))+'</li>');i++;}html.push('<ol>'+li.join('')+'</ol>');continue;}
  const img=line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
  if(img&&safeUrl(img[2],true)){html.push('<figure><img src="'+esc(safeUrl(img[2],true))+'" alt="'+esc(img[1])+'" loading="lazy">'+(img[3]?'<figcaption>'+esc(img[3])+'</figcaption>':'')+'</figure>');i++;continue;}
  const p:string[]=[];
  while(i<lines.length&&lines[i].trim()&&!/^(#{1,3}\s|>\s?|\s*[-*]\s+|\s*\d+[.)]\s+|(-{3,}|\*{3,})\s*$)/.test(lines[i])&&!/^!\[[^\]]*\]\([^)]*\)\s*$/.test(lines[i].trim())){p.push(lines[i]);i++;}
  if(p.length)html.push('<p>'+p.map(inline).join('<br>')+'</p>');else i++;
 }
 return html.join('\n');
}

export function wordCount(md:string){
 const t=String(md??'').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[#>*_`\-]/g,' ');
 return t.split(/\s+/).filter(w=>/[\p{L}\p{N}]/u.test(w)).length;
}

export type PostLike={title:string;slug:string;h1:string;excerpt:string;body:string;focus_keyword:string;hero_path:string|null;hero_alt:string;og_image_path:string|null;meta_title:string;meta_description:string;canonical_url:string};
export type SeoCheck={key:string;label:string;state:'pass'|'warn'|'fail';detail:string};
const has=(hay:string,needle:string)=>needle.trim()!==''&&hay.toLowerCase().includes(needle.trim().toLowerCase());
const PLACEHOLDER_ALT=/^(describe this image|image|photo|picture|img\d*|untitled)?$/i;

export function analyzePost(p:PostLike):SeoCheck[]{
 const out:SeoCheck[]=[],add=(key:string,label:string,state:SeoCheck['state'],detail:string)=>out.push({key,label,state,detail});
 const metaTitle=(p.meta_title||p.title).trim(),h1=(p.h1||p.title).trim(),desc=p.meta_description.trim(),kw=p.focus_keyword.trim();
 const heads=outline(p.body),words=wordCount(p.body);

 add('title','Meta title length',!metaTitle?'fail':metaTitle.length>=30&&metaTitle.length<=60?'pass':metaTitle.length>=20&&metaTitle.length<=70?'warn':'fail',metaTitle?metaTitle.length+' characters. Aim for 30 to 60.':'Add a title.');
 add('description','Meta description length',!desc?'fail':desc.length>=70&&desc.length<=160?'pass':desc.length>=50&&desc.length<=180?'warn':'fail',desc?desc.length+' characters. Aim for 70 to 160.':'Add a meta description. It is the text shown under your title in Google.');
 add('h1','One clear H1',!h1?'fail':h1.length>70?'warn':'pass',h1?(h1.length>70?'H1 is '+h1.length+' characters. Shorter reads better.':'The page heading: "'+h1.slice(0,80)+'"'):'The H1 is the main heading. It defaults to the title.');
 add('body_h1','No second H1 in the text',bodyHasH1(p.body)?'fail':'pass',bodyHasH1(p.body)?'A line starts with a single "#". The page already has its H1, so use ## for sections.':'Sections start at H2.');
 const h2=heads.filter(h=>h.level===2).length;
 add('h2','Sections with H2 headings',h2>=2?'pass':h2===1?'warn':words>=150?'fail':'warn',h2+' H2 heading'+(h2===1?'':'s')+'. Break the post into at least 2 sections.');
 const firstH3=heads.findIndex(h=>h.level===3),firstH2=heads.findIndex(h=>h.level===2);
 add('order','Heading order',firstH3!==-1&&(firstH2===-1||firstH3<firstH2)?'fail':'pass',firstH3!==-1&&(firstH2===-1||firstH3<firstH2)?'An H3 comes before any H2. Use H3 only inside an H2 section.':'H3 headings sit under H2 headings.');
 add('words','Length',words>=300?'pass':words>=150?'warn':'fail',words+' words. Aim for 300 or more.');
 const slugOk=validSlug(p.slug);
 add('slug','URL slug',!p.slug?'fail':!slugOk?'fail':p.slug.length>75?'warn':'pass',!p.slug?'Add a URL slug.':!slugOk?'Use lowercase letters, numbers and single hyphens only.':'/'+p.slug+(p.slug.length>75?' is long. Shorter is better.':''));
 add('hero','Main image',p.hero_path?(p.hero_alt.trim()&&!PLACEHOLDER_ALT.test(p.hero_alt.trim())?'pass':'fail'):'warn',p.hero_path?(p.hero_alt.trim()?'Main image has alt text.':'Add alt text to the main image.'):'No main image. Posts with a picture are shared more.');
 const imgs=[...String(p.body).matchAll(/!\[([^\]]*)\]\(/g)],bad=imgs.filter(m=>PLACEHOLDER_ALT.test(m[1].trim())).length;
 add('alt','Alt text on pictures in the text',!imgs.length?'pass':bad?'fail':'pass',!imgs.length?'No pictures in the text.':bad?bad+' of '+imgs.length+' pictures need real alt text, a short description of what is in the picture.':'All '+imgs.length+' pictures have alt text.');
 const links=[...String(p.body).matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]+)\)/g)].map(m=>m[1]);
 add('links','Links',links.length?'pass':'warn',links.length?links.length+' link'+(links.length===1?'':'s')+' in the text.':'No links. Link to a related page on your site or a trusted source.');
 add('share','Social share image',p.og_image_path||p.hero_path?'pass':'warn',p.og_image_path||p.hero_path?'Shared links will show a picture.':'Add a main or share image so shared links show a picture.');
 add('excerpt','Short summary (excerpt)',p.excerpt.trim()?'pass':'warn',p.excerpt.trim()?'Used in blog lists.':'Add a one or two sentence summary for blog lists.');
 add('canonical','Canonical address',!p.canonical_url?'pass':/^https:\/\/[^\s]+$/.test(p.canonical_url)?'pass':'fail',!p.canonical_url?'Not set. Fine if this page is the original.':/^https:\/\/[^\s]+$/.test(p.canonical_url)?'Points to '+p.canonical_url:'Must be a full https address.');
 if(!kw)add('keyword','Focus keyword','warn','Add the phrase people would search for. We then check it appears in the right places.');
 else{
  add('kw_title','Keyword in the meta title',has(metaTitle,kw)?'pass':'warn',has(metaTitle,kw)?'Found.':'"'+kw+'" is not in the meta title.');
  add('kw_h1','Keyword in the H1',has(h1,kw)?'pass':'warn',has(h1,kw)?'Found.':'"'+kw+'" is not in the H1.');
  add('kw_slug','Keyword in the URL',has(p.slug,slugify(kw))?'pass':'warn',has(p.slug,slugify(kw))?'Found.':'"'+slugify(kw)+'" is not in the URL.');
  add('kw_desc','Keyword in the meta description',has(desc,kw)?'pass':'warn',has(desc,kw)?'Found.':'"'+kw+'" is not in the meta description.');
  const intro=String(p.body).split(/\s+/).slice(0,120).join(' ');
  add('kw_intro','Keyword in the opening',has(intro,kw)?'pass':'warn',has(intro,kw)?'Found in the first 120 words.':'"'+kw+'" is not in the first 120 words.');
  add('kw_sub','Keyword in a subheading',heads.some(h=>has(h.text,kw))?'pass':'warn',heads.some(h=>has(h.text,kw))?'Found.':'"'+kw+'" is not in any H2 or H3.');
 }
 return out;
}
export function seoScore(checks:SeoCheck[]){
 if(!checks.length)return 0;
 const pts=checks.reduce((n,c)=>n+(c.state==='pass'?1:c.state==='warn'?0.5:0),0);
 return Math.round(pts/checks.length*100);
}
/** Things that must be true before a post goes live. Warnings do not block. */
export function publishBlockers(p:PostLike){
 const out:string[]=[];
 if(!p.title.trim())out.push('Add a title.');
 if(!validSlug(p.slug))out.push('Add a valid URL slug.');
 if(wordCount(p.body)<1)out.push('Write the post.');
 if(!p.meta_description.trim())out.push('Add a meta description.');
 if(p.hero_path&&!p.hero_alt.trim())out.push('Add alt text to the main image.');
 if(bodyHasH1(p.body))out.push('Remove the extra H1 from the text (use ## for sections).');
 if(p.canonical_url&&!/^https:\/\/[^\s]+$/.test(p.canonical_url))out.push('Canonical address must be a full https address.');
 if((String(p.body).match(/!\[([^\]]*)\]\(/g)||[]).some(m=>PLACEHOLDER_ALT.test(m.slice(2,-2).trim())))out.push('Give every picture in the text real alt text.');
 return out;
}
/** What Google shows: title cut near 60 characters, address, description cut near 160. */
export function snippet(title:string,description:string){
 const cut=(s:string,n:number)=>s.length<=n?s:s.slice(0,n-1).replace(/\s+\S*$/,'')+'…';
 return {title:cut(title,60),description:cut(description,160)};
}
export function articleJsonLd(p:{title:string;h1:string;excerpt:string;meta_description:string;author_name:string;published_at:string|null;updated_at:string;image:string|null;url:string;publisher:string}){
 return {
  '@context':'https://schema.org','@type':'BlogPosting',
  headline:(p.h1||p.title).slice(0,110),description:p.meta_description||p.excerpt,
  ...(p.image?{image:[p.image]}:{}),
  datePublished:p.published_at??undefined,dateModified:p.updated_at,
  author:{'@type':'Person',name:p.author_name||p.publisher},
  publisher:{'@type':'Organization',name:p.publisher},
  mainEntityOfPage:{'@type':'WebPage','@id':p.url}
 };
}
