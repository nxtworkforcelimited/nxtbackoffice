import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {z} from 'zod';
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));if(!ctx?.workspace)return NextResponse.json({error:'Sign in required'},{status:401});
 const parsed=z.object({id:z.uuid(),action:z.enum(['submit','approve','reject','revise','comment']),body:z.string().trim().min(1).max(4000).optional()}).safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Invalid request'},{status:400});
 if(parsed.data.action==='comment'){
  if(!parsed.data.body)return NextResponse.json({error:'Write a comment first'},{status:400});
  const {data,error}=await ctx.db.from('content_comments').insert({tenant_id:ctx.workspace.id,post_id:parsed.data.id,body:parsed.data.body}).select().single();
  return NextResponse.json(error?{error:'Comment could not be saved'}:data,{status:error?403:201});
 }
 const {data,error}=await ctx.db.rpc('review_content',{t:ctx.workspace.id,r:parsed.data.id,a:parsed.data.action});
 return NextResponse.json(error?{error:error.message}:data,{status:error?403:200});
}
