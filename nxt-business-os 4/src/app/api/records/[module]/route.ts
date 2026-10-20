import { NextRequest,NextResponse } from 'next/server';
import { context } from '@/lib/context';
import { modules, type Module } from '@/lib/types';
import { recordSchema,fields } from '@/lib/validation';
export async function POST(req:NextRequest,{params}:{params:Promise<{module:string}>}){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const module=(await params).module as Module;
 if(!modules.includes(module)||module==='documents')return NextResponse.json({error:'Unknown operation'},{status:400});
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));
 if(!ctx?.workspace||ctx.workspace.role==='client')return NextResponse.json({error:'Staff access required'},{status:403});
 let body;try{body=await req.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
 const parsed=recordSchema(module).safeParse(body);
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues.map(i=>i.message).join('; ')},{status:400});
 const {data,error}=await ctx.db.from(module).insert({...fields(module,parsed.data),tenant_id:ctx.workspace.id}).select().single();
 if(error)return NextResponse.json({error:'Record could not be saved. Check client and workspace permissions.'},{status:400});
 return NextResponse.json(data,{status:201});
}
export async function PATCH(req:NextRequest,{params}:{params:Promise<{module:string}>}){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const module=(await params).module as Module;if(!modules.includes(module)||module==='documents')return NextResponse.json({error:'Unknown module'},{status:400});
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));if(!ctx?.workspace||ctx.workspace.role==='client')return NextResponse.json({error:'Staff access required'},{status:403});
 const {z}=await import('zod');const {statuses}=await import('@/lib/types');
 const parsed=z.object({id:z.uuid(),status:z.enum(statuses[module] as [string,...string[]])}).strict().safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Invalid update'},{status:400});
 const {data,error}=await ctx.db.from(module).update({status:parsed.data.status}).eq('id',parsed.data.id).eq('tenant_id',ctx.workspace.id).select().single();
 if(error)return NextResponse.json({error:'Update failed'},{status:400});return NextResponse.json(data);
}
