import {configured,supabase} from '@/lib/supabase/server';
export type WebsiteCopy={title:string;description:string;eyebrow?:string;heading:string;body:string;cta_label?:string;cta_href?:string};
export async function websiteCopy(slug:string,fallback:WebsiteCopy):Promise<WebsiteCopy>{
 if(!configured())return fallback;
 try{
  const db=await supabase();
  const {data,error}=await db.from('website_pages').select('title,description,content,status').eq('slug',slug).eq('status','published').maybeSingle();
  if(error||!data)return fallback;
  return {...fallback,title:data.title||fallback.title,description:data.description||fallback.description,...(data.content||{})};
 }catch{return fallback;}
}
