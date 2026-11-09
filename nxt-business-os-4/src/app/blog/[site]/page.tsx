import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {listPosts,siteBase} from '@/lib/server/blog-public';

export const dynamic='force-dynamic';
type P={params:Promise<{site:string}>};
export async function generateMetadata({params}:P):Promise<Metadata>{
 const {site}=await params,r=await listPosts(site,null,1,1);
 if('error' in r)return {title:'Blog',robots:{index:false}};
 return {title:r.site.name+' Blog',alternates:{canonical:siteBase()+'/blog/'+r.site.slug}};
}
export default async function BlogIndex({params}:P){
 const {site}=await params,r=await listPosts(site,null,1,30);
 if('error' in r)notFound();
 return <main style={{background:'#fff',minHeight:'100vh',color:'#0f172a',fontFamily:'Montserrat,system-ui,sans-serif'}}>
  <section style={{maxWidth:760,margin:'0 auto',padding:'48px 20px 72px'}}>
   <h1 style={{fontSize:'clamp(28px,5vw,40px)',margin:'0 0 28px'}}>{r.site.name} Blog</h1>
   {r.posts.map(p=><article key={p.slug} style={{margin:'0 0 32px'}}>
    {p.image&&<a href={p.path}><img src={p.image} alt={p.image_alt} style={{width:'100%',height:'auto',borderRadius:14}}/></a>}
    <h2 style={{fontSize:22,margin:'12px 0 6px'}}><a href={p.path} style={{color:'inherit',textDecoration:'none'}}>{p.h1}</a></h2>
    {p.excerpt&&<p style={{margin:0,opacity:.8}}>{p.excerpt}</p>}
   </article>)}
   {!r.posts.length&&<p>No posts yet.</p>}
  </section>
 </main>;
}
