import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {z} from 'zod';
const schema=z.object({id:z.uuid(),slug:z.string().min(1).max(160),title:z.string().min(1).max(200),description:z.string().max(500),status:z.enum(['draft','published']),content:z.object({eyebrow:z.string().max(100).optional(),heading:z.string().max(300).optional(),body:z.string().max(5000).optional(),cta_label:z.string().max(100).optional(),cta_href:z.string().max(500).optional()}).passthrough()}).strict();
export async function PATCH(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));if(!ctx?.workspace)return NextResponse.json({error:'Workspace required'},{status:403});
 const allowed=ctx.workspace.role==='owner'||ctx.workspace.role==='admin'||(ctx.workspace.permissions??[]).includes('website');if(!allowed)return NextResponse.json({error:'Website access required'},{status:403});
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid page data'},{status:400});
 const p=parsed.data;
 const {data,error}=await ctx.db.from('website_pages').update({title:p.title,description:p.description,status:p.status,content:p.content,updated_by:ctx.user.id,updated_at:new Date().toISOString()}).eq('id',p.id).eq('tenant_id',ctx.workspace.id).select('id,slug,title,description,status,content').single();
 if(error)return NextResponse.json({error:'Page could not be saved'},{status:400});
 return NextResponse.json(data);
}
