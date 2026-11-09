import {NextRequest,NextResponse} from 'next/server';
import {loadPost} from '@/lib/server/blog-public';
export const dynamic='force-dynamic';
const headers={'Access-Control-Allow-Origin':'*','Cache-Control':'public, s-maxage=60, stale-while-revalidate=300'};
export function OPTIONS(){return new NextResponse(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET','Access-Control-Allow-Headers':'Content-Type'}});}
// One published post with ready-to-use HTML and SEO tags. ?site=<workspace address>  optional: &client=<client id>
export async function GET(req:NextRequest,{params}:{params:Promise<{slug:string}>}){
 const {slug}=await params,q=req.nextUrl.searchParams,site=q.get('site')??'';
 if(!site)return NextResponse.json({error:'Add ?site=your-workspace-address'},{status:400,headers});
 const out=await loadPost(site,slug,q.get('client'));
 if('error' in out)return NextResponse.json({error:out.error==='not_found'?'Post not found':'Blog is temporarily unavailable'},{status:out.error==='not_found'?404:503,headers:{...headers,'Cache-Control':'no-store'}});
 return NextResponse.json(out,{headers});
}
