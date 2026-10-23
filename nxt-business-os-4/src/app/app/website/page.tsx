import {redirect} from 'next/navigation';
import {context} from '@/lib/context';
import WebsiteManager from '@/components/website-manager';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{workspace?:string}>}){
 const ctx=await context((await searchParams).workspace);if(!ctx)redirect('/login');if(!ctx.workspace)redirect('/app');
 const allowed=ctx.workspace.role==='owner'||ctx.workspace.role==='admin'||(ctx.workspace.permissions??[]).includes('website');
 if(!allowed)redirect('/app');
 const {data,error}=await ctx.db.from('website_pages').select('id,slug,title,description,status,content').eq('tenant_id',ctx.workspace.id).order('slug');
 if(error)return <main style={{padding:40,fontFamily:'Arial'}}>Website Manager needs the new CMS migration before it can load.</main>;
 return <WebsiteManager initial={(data??[]) as any} workspace={ctx.workspace.id}/>;
}
