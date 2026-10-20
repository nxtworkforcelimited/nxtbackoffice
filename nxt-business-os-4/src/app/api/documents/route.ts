import { NextRequest,NextResponse } from 'next/server';
import { context } from '@/lib/context';
import {fileMime,maxFileBytes} from '@/lib/file-formats';
import {z} from 'zod';
const BUCKET='workspace-documents';
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));if(!ctx?.workspace)return NextResponse.json({error:'Staff access required'},{status:403});
 const parsed=z.object({name:z.string().min(1).max(255),bytes:z.number().int().min(1).max(maxFileBytes),title:z.string().trim().min(1).max(160),client_id:z.uuid().nullable(),client_visible:z.boolean()}).safeParse(await req.json().catch(()=>null));
 if(!parsed.success||!fileMime(parsed.success?parsed.data.name:''))return NextResponse.json({error:'Choose a supported file up to 50 MB and a title.'},{status:400});
 const v=parsed.data,title=v.title,client_id=ctx.workspace.role==='client'?ctx.workspace.client_id:v.client_id,visible=ctx.workspace.role==='client'||v.client_visible;
 if(visible&&!client_id)return NextResponse.json({error:'Choose a client before sharing.'},{status:400});
 const path=`${ctx.workspace.id}/${crypto.randomUUID()}`;
 const {data,error}=await ctx.db.from('documents').insert({tenant_id:ctx.workspace.id,title,client_id,client_visible:visible,status:visible?'shared':'internal',object_path:path}).select().single();
 if(error)return NextResponse.json({error:'Document permissions are invalid.'},{status:400});
 return NextResponse.json(data,{status:201});
}
export async function GET(req:NextRequest){
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));if(!ctx?.workspace)return NextResponse.json({error:'Unauthorized'},{status:401});
 const {data,error}=await ctx.db.from('documents').select('object_path,title').eq('tenant_id',ctx.workspace.id).eq('id',req.nextUrl.searchParams.get('id')??'').single();
 if(error||!data?.object_path)return NextResponse.json({error:'Not found'},{status:404});
 const signed=await ctx.db.storage.from(BUCKET).createSignedUrl(data.object_path,60,{download:data.title});
 if(signed.error)return NextResponse.json({error:'File unavailable'},{status:404});return NextResponse.json({url:signed.data.signedUrl},{headers:{'Cache-Control':'private, no-store'}});
}
