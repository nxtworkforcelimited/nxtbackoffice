import {createClient} from '@supabase/supabase-js';
import {renderMarkdown,outline,articleJsonLd} from '@/lib/blog';

// Public blog data. Reads published posts only, with the service key, and returns only fields meant for readers.
const admin=()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
};
export const siteBase=()=>(process.env.NEXT_PUBLIC_SITE_URL||'https://nxt-business-os.vercel.app').replace(/\/+$/,'');
export const imageUrl=(path:string|null)=>path&&process.env.NEXT_PUBLIC_SUPABASE_URL?process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/,'')+'/storage/v1/object/public/blog-images/'+path.split('/').map(encodeURIComponent).join('/'):null;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITE=/^[a-z0-9-]{1,80}$/i;

async function tenantFor(db:NonNullable<ReturnType<typeof admin>>,site:string){
 if(!SITE.test(site))return null;
 const q=UUID.test(site)?db.from('tenants').select('id,name,slug').eq('id',site):db.from('tenants').select('id,name,slug').eq('slug',site);
 const r=await q.maybeSingle();return r.data??null;
}
const live=(q:any,tenantId:string,clientId:string|null)=>{
 let x=q.eq('tenant_id',tenantId).eq('status','published').or('publish_at.is.null,publish_at.lte.'+new Date().toISOString());
 x=clientId?x.eq('client_id',clientId):x.is('client_id',null);return x;
};
const listCols='slug,title,h1,excerpt,hero_path,hero_alt,category,tags,author_name,published_at,updated_at';

export async function listPosts(site:string,clientId:string|null,page=1,limit=20){
 const db=admin();if(!db)return {error:'unavailable' as const};
 if(clientId&&!UUID.test(clientId))return {error:'not_found' as const};
 const t=await tenantFor(db,site);if(!t)return {error:'not_found' as const};
 const from=(Math.max(1,page)-1)*limit;
 const r=await live(db.from('blog_posts').select(listCols),t.id,clientId).order('published_at',{ascending:false}).range(from,from+limit);
 if(r.error)return {error:'unavailable' as const};
 const rows=(r.data??[]) as any[];
 return {site:{name:t.name,slug:t.slug},page,has_more:rows.length>limit,posts:rows.slice(0,limit).map((p:any)=>({slug:p.slug,title:p.title,h1:p.h1||p.title,excerpt:p.excerpt,image:imageUrl(p.hero_path),image_alt:p.hero_alt,category:p.category,tags:p.tags,author:p.author_name,published_at:p.published_at,updated_at:p.updated_at,path:'/blog/'+t.slug+'/'+p.slug}))};
}
export async function loadPost(site:string,slug:string,clientId:string|null){
 const db=admin();if(!db)return {error:'unavailable' as const};
 if(clientId&&!UUID.test(clientId))return {error:'not_found' as const};
 if(!/^[a-z0-9-]{1,90}$/.test(slug))return {error:'not_found' as const};
 const t=await tenantFor(db,site);if(!t)return {error:'not_found' as const};
 const r=await live(db.from('blog_posts').select('slug,title,h1,excerpt,body,hero_path,hero_alt,og_image_path,meta_title,meta_description,canonical_url,category,tags,author_name,published_at,updated_at').eq('slug',slug),t.id,clientId).maybeSingle();
 if(r.error)return {error:'unavailable' as const};if(!r.data)return {error:'not_found' as const};
 const p:any=r.data,pageUrl=siteBase()+'/blog/'+t.slug+'/'+p.slug,canonical=p.canonical_url||pageUrl,og=imageUrl(p.og_image_path||p.hero_path);
 return {
  post:{slug:p.slug,title:p.title,h1:p.h1||p.title,excerpt:p.excerpt,html:renderMarkdown(p.body),outline:outline(p.body),image:imageUrl(p.hero_path),image_alt:p.hero_alt,category:p.category,tags:p.tags,author:p.author_name,published_at:p.published_at,updated_at:p.updated_at},
  seo:{title:p.meta_title||p.title,description:p.meta_description||p.excerpt,canonical,og_image:og,json_ld:articleJsonLd({title:p.title,h1:p.h1,excerpt:p.excerpt,meta_description:p.meta_description,author_name:p.author_name,published_at:p.published_at,updated_at:p.updated_at,image:og,url:canonical,publisher:t.name})},
  site:{name:t.name,slug:t.slug}
 };
}
