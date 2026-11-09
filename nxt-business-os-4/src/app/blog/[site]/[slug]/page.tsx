import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {loadPost} from '@/lib/server/blog-public';

export const dynamic='force-dynamic';
type P={params:Promise<{site:string;slug:string}>};

export async function generateMetadata({params}:P):Promise<Metadata>{
 const {site,slug}=await params,r=await loadPost(site,slug,null);
 if('error' in r)return {title:'Post not found',robots:{index:false}};
 const {seo,post}=r;
 return {
  title:seo.title,description:seo.description,alternates:{canonical:seo.canonical},
  openGraph:{type:'article',title:seo.title,description:seo.description,url:seo.canonical,...(seo.og_image?{images:[{url:seo.og_image,alt:post.image_alt||post.title}]}:{}),...(post.published_at?{publishedTime:post.published_at}:{})},
  twitter:{card:seo.og_image?'summary_large_image':'summary',title:seo.title,description:seo.description,...(seo.og_image?{images:[seo.og_image]}:{})}
 };
}
export default async function BlogPost({params}:P){
 const {site,slug}=await params,r=await loadPost(site,slug,null);
 if('error' in r)notFound();
 const {post,seo,site:s}=r;
 const date=post.published_at?new Date(post.published_at).toLocaleDateString('en-GB',{timeZone:'Africa/Harare',day:'numeric',month:'long',year:'numeric'}):'';
 return <main style={{background:'#fff',minHeight:'100vh',color:'#0f172a',fontFamily:'Montserrat,system-ui,sans-serif'}}>
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(seo.json_ld).replace(/</g,'\\u003c')}}/>
  <style>{`.blog-body{line-height:1.75;font-size:17px}.blog-body h2{font-size:26px;margin:2em 0 .5em}.blog-body h3{font-size:20px;margin:1.6em 0 .4em}.blog-body img{max-width:100%;height:auto;border-radius:12px}.blog-body figure{margin:1.6em 0}.blog-body figcaption{font-size:13px;opacity:.65;margin-top:6px}.blog-body blockquote{border-left:4px solid #a78bfa;margin:1.4em 0;padding:.2em 1em;opacity:.9}.blog-body a{color:#6d28d9}`}</style>
  <article style={{maxWidth:720,margin:'0 auto',padding:'48px 20px 72px'}}>
   {post.category&&<p style={{fontSize:13,letterSpacing:'.06em',textTransform:'uppercase',opacity:.65,margin:'0 0 8px'}}>{post.category}</p>}
   <h1 style={{fontSize:'clamp(28px,5vw,40px)',lineHeight:1.2,margin:'0 0 12px'}}>{post.h1}</h1>
   <p style={{opacity:.65,margin:'0 0 28px',fontSize:14}}>{[post.author,date].filter(Boolean).join(' · ')}</p>
   {post.image&&<img src={post.image} alt={post.image_alt} style={{width:'100%',height:'auto',borderRadius:16,margin:'0 0 32px'}}/>}
   <div className="blog-body" dangerouslySetInnerHTML={{__html:post.html}}/>
   <footer style={{fontSize:12,opacity:.6,marginTop:64,borderTop:'1px solid #e2e8f0',paddingTop:16}}>{s.name} · hello@nxt-workforce.com · www.nxt-workforce.com</footer>
  </article>
 </main>;
}
