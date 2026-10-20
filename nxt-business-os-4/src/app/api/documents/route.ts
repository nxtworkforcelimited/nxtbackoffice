import { NextRequest,NextResponse } from 'next/server';
import { context } from '@/lib/context';
const BUCKET='workspace-documents';
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));if(!ctx?.workspace)return NextResponse.json({error:'Staff access required'},{status:403});
 const form=await req.formData();const file=form.get('file');const title=String(form.get('title')??'').trim();const client_id=ctx.workspace.role==='client'?ctx.workspace.client_id:String(form.get('client_id')??'')||null;const visible=ctx.workspace.role==='client'||form.get('client_visible')==='true';
 if(!(file instanceof File)||file.size>10*1024*1024||file.size===0||!title||title.length>160|| (visible&&!client_id)||!['application/pdf','image/png','image/jpeg','text/plain'].includes(file.type))return NextResponse.json({error:'Choose a PDF, PNG, JPG or TXT up to 10 MB, a title, and a client if sharing.'},{status:400});
 const path=`${ctx.workspace.id}/${crypto.randomUUID()}`;
 const {data,error}=await ctx.db.from('documents').insert({tenant_id:ctx.workspace.id,title,client_id,client_visible:visible,status:visible?'shared':'internal',object_path:path}).select().single();
 if(error)return NextResponse.json({error:'Document permissions are invalid.'},{status:400});
 const upload=await ctx.db.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});
 if(upload.error){await ctx.db.from('documents').delete().eq('id',data.id);return NextResponse.json({error:'Upload failed. Check bucket configuration.'},{status:400});}
 return NextResponse.json(data,{status:201});
}
export async function GET(req:NextRequest){
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));if(!ctx?.workspace)return NextResponse.json({error:'Unauthorized'},{status:401});
 const {data,error}=await ctx.db.from('documents').select('object_path,title').eq('tenant_id',ctx.workspace.id).eq('id',req.nextUrl.searchParams.get('id')??'').single();
 if(error||!data?.object_path)return NextResponse.json({error:'Not found'},{status:404});
 const signed=await ctx.db.storage.from(BUCKET).createSignedUrl(data.object_path,60,{download:data.title});
 if(signed.error)return NextResponse.json({error:'File unavailable'},{status:404});return NextResponse.json({url:signed.data.signedUrl},{headers:{'Cache-Control':'private, no-store'}});
}
