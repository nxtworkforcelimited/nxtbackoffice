import {NextRequest,NextResponse} from 'next/server';
import {listPosts} from '@/lib/server/blog-public';
export const dynamic='force-dynamic';
const headers={'Access-Control-Allow-Origin':'*','Cache-Control':'public, s-maxage=60, stale-while-revalidate=300'};
export function OPTIONS(){return new NextResponse(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET','Access-Control-Allow-Headers':'Content-Type'}});}
// Public list of published posts. ?site=<workspace address>  optional: &client=<client id>&page=1&limit=20
export async function GET(req:NextRequest){
 const q=req.nextUrl.searchParams,site=q.get('site')??'';
 if(!site)return NextResponse.json({error:'Add ?site=your-workspace-address'},{status:400,headers});
 const limit=Math.min(50,Math.max(1,Number(q.get('limit'))||20)),page=Math.min(500,Math.max(1,Number(q.get('page'))||1));
 const out=await listPosts(site,q.get('client'),page,limit);
 if('error' in out)return NextResponse.json({error:out.error==='not_found'?'Blog not found':'Blog is temporarily unavailable'},{status:out.error==='not_found'?404:503,headers:{...headers,'Cache-Control':'no-store'}});
 return NextResponse.json(out,{headers});
}
