// Automatic website checks. Pure functions: read a page's HTML and say what is present.
// People still confirm things a robot cannot judge (content, layout, forms).
export type Check={key:string;label:string;state:'pass'|'warn'|'fail';detail:string};

const tag=(html:string,re:RegExp)=>html.match(re)?.[1]?.replace(/\s+/g,' ').trim()??'';
const strip=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
function meta(html:string,attr:'name'|'property',value:string){
 for(const m of html.matchAll(/<meta\b[^>]*>/gi)){
  const t=m[0],a=t.match(new RegExp(attr+'\\s*=\\s*["\']'+value+'["\']','i'));
  if(a)return t.match(/content\s*=\s*"([^"]*)"/i)?.[1]??t.match(/content\s*=\s*'([^']*)'/i)?.[1]??'';
 }
 return '';
}
export function analyzeHtml(html:string):Check[]{
 const out:Check[]=[];
 const title=strip(tag(html,/<title[^>]*>([\s\S]*?)<\/title>/i));
 out.push(!title?{key:'title',label:'Page title',state:'fail',detail:'No page title found.'}
  :title.length<15||title.length>65?{key:'title',label:'Page title',state:'warn',detail:'Title is '+title.length+' characters. Aim for 15 to 65: "'+title.slice(0,70)+'"'}
  :{key:'title',label:'Page title',state:'pass',detail:title});
 const desc=meta(html,'name','description').trim();
 out.push(!desc?{key:'description',label:'Meta description',state:'fail',detail:'No meta description found.'}
  :desc.length<50||desc.length>165?{key:'description',label:'Meta description',state:'warn',detail:'Description is '+desc.length+' characters. Aim for 50 to 160.'}
  :{key:'description',label:'Meta description',state:'pass',detail:desc.length+' characters'});
 const h1=[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>strip(m[1])).filter(Boolean);
 out.push(h1.length===1?{key:'h1',label:'One H1 heading',state:'pass',detail:h1[0].slice(0,90)}
  :h1.length===0?{key:'h1',label:'One H1 heading',state:'fail',detail:'No H1 heading found.'}
  :{key:'h1',label:'One H1 heading',state:'warn',detail:h1.length+' H1 headings found. Use exactly one.'});
 out.push(/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html)?{key:'viewport',label:'Mobile setup (viewport)',state:'pass',detail:'Viewport tag present.'}:{key:'viewport',label:'Mobile setup (viewport)',state:'fail',detail:'No viewport tag, so phones may show a shrunken desktop page.'});
 const lang=tag(html,/<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i);
 out.push(lang?{key:'lang',label:'Page language',state:'pass',detail:lang}:{key:'lang',label:'Page language',state:'warn',detail:'No lang attribute on the html tag.'});
 const og=meta(html,'property','og:image');
 out.push(og?{key:'og_image',label:'Social share image',state:'pass',detail:'og:image set.'}:{key:'og_image',label:'Social share image',state:'warn',detail:'No og:image, so shared links show no picture.'});
 out.push(/<link\b[^>]*rel\s*=\s*["'][^"']*canonical[^"']*["']/i.test(html)?{key:'canonical',label:'Canonical link',state:'pass',detail:'Present.'}:{key:'canonical',label:'Canonical link',state:'warn',detail:'No canonical link.'});
 out.push(/<link\b[^>]*rel\s*=\s*["'][^"']*icon[^"']*["']/i.test(html)?{key:'favicon',label:'Favicon',state:'pass',detail:'Present.'}:{key:'favicon',label:'Favicon',state:'warn',detail:'No favicon link in the page head.'});
 const robots=meta(html,'name','robots').toLowerCase();
 out.push(/noindex/.test(robots)?{key:'indexing',label:'Allowed in Google',state:'fail',detail:'Page is set to noindex. Remove this before launch.'}:{key:'indexing',label:'Allowed in Google',state:'pass',detail:'No noindex tag.'});
 const imgs=[...html.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]),noAlt=imgs.filter(t=>!/\balt\s*=/i.test(t)).length;
 out.push(!imgs.length?{key:'alt',label:'Image descriptions (alt text)',state:'pass',detail:'No images on this page.'}:noAlt?{key:'alt',label:'Image descriptions (alt text)',state:'warn',detail:noAlt+' of '+imgs.length+' images have no alt text.'}:{key:'alt',label:'Image descriptions (alt text)',state:'pass',detail:'All '+imgs.length+' images have alt text.'});
 return out;
}
/** True only for addresses on the public internet. Used before fetching a customer-supplied URL. */
export function isPublicIp(ip:string){
 const v=ip.toLowerCase();
 const mapped=v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);if(mapped)return isPublicIp(mapped[1]);
 if(/^\d+\.\d+\.\d+\.\d+$/.test(v)){
  const [a,b]=v.split('.').map(Number);
  if([a,b].some(n=>n>255))return false;
  if(a===0||a===10||a===127||a>=224)return false;
  if(a===100&&b>=64&&b<=127)return false;
  if(a===169&&b===254)return false;
  if(a===172&&b>=16&&b<=31)return false;
  if(a===192&&(b===168||b===0))return false;
  if(a===198&&(b===18||b===19))return false;
  return true;
 }
 if(v.includes(':')){
  if(v==='::'||v==='::1')return false;
  if(/^f[cd]/.test(v)||/^fe[89ab]/.test(v)||v.startsWith('ff'))return false;
  return true;
 }
 return false;
}
export function summarise(checks:Check[]){
 return {pass:checks.filter(c=>c.state==='pass').length,warn:checks.filter(c=>c.state==='warn').length,fail:checks.filter(c=>c.state==='fail').length};
}
