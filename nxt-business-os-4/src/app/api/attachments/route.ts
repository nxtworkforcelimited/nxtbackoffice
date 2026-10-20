import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {z} from 'zod';
export async function GET(req:NextRequest){
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));if(!ctx?.workspace)return NextResponse.json({error:'Sign in required'},{status:401});
 const kind=req.nextUrl.searchParams.get('kind'),id=req.nextUrl.searchParams.get('id');
 if(!['post','request'].includes(kind??'')||!z.uuid().safeParse(id).success)return NextResponse.json({error:'Invalid record'},{status:400});
 const {data,error}=await ctx.db.from('work_attachments').select('*').eq('tenant_id',ctx.workspace.id).eq(kind==='post'?'post_id':'request_id',id!).order('position').order('created_at');
 if(error)return NextResponse.json({error:'Attachments unavailable. Check collaboration migration.'},{status:400});
 const files=await Promise.all((data??[]).map(async f=>{const r=await ctx.db.storage.from('work-attachments').createSignedUrl(f.object_path,300);return {...f,url:r.data?.signedUrl??null};}));
 return NextResponse.json(files,{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));if(!ctx?.workspace)return NextResponse.json({error:'Sign in required'},{status:401});
 const parsed=z.object({kind:z.enum(['post','request']),parent:z.uuid(),name:z.string().min(1).max(200),mime:z.string(),bytes:z.number().int().positive().max(52428800),position:z.number().int().min(0).max(1000)}).safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Choose a supported file, maximum 50 MB.'},{status:400});
 const f=parsed.data,id=crypto.randomUUID();
 const {data,error}=await ctx.db.from('work_attachments').insert({id,tenant_id:ctx.workspace.id,[f.kind==='post'?'post_id':'request_id']:f.parent,name:f.name,mime:f.mime,bytes:f.bytes,position:f.position,object_path:`${ctx.workspace.id}/${id}`}).select().single();
 return NextResponse.json(error?{error:error.message}:data,{status:error?400:201});
}
export async function DELETE(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));if(!ctx?.workspace)return NextResponse.json({error:'Sign in required'},{status:401});
 const {error}=await ctx.db.rpc('remove_work_attachment',{t:ctx.workspace.id,r:req.nextUrl.searchParams.get('id')});
 return NextResponse.json(error?{error:error.message}:{ok:true},{status:error?400:200});
}
