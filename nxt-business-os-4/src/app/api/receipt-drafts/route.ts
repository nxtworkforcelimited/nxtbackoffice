import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {trustedRequest} from '@/lib/request-origin';
const draft=z.object({id:z.uuid(),recipient:z.string().trim().min(1).max(160),description:z.string().trim().min(1).max(1000),amount:z.number().finite().positive().max(100000000).multipleOf(0.01)}).strict();
export async function GET(req:NextRequest){
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));
 if(!ctx?.workspace)return NextResponse.json({error:'Sign in required'},{status:401});
 if(ctx.workspace.role==='client'||!['finance','finance_admin'].some(cap=>allowed(ctx.workspace!.role,ctx.workspace!.permissions??[],cap)))return NextResponse.json({error:'Finance access required'},{status:403});
 const {data,error}=await ctx.db.from('receipt_drafts').select('*').eq('tenant_id',ctx.workspace.id).order('created_at',{ascending:false});
 return NextResponse.json(error?{error:'Could not load draft receipts.'}:{drafts:data},{status:error?500:200});
}
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return NextResponse.json({error:'Forbidden'},{status:403});
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));
 if(!ctx?.workspace)return NextResponse.json({error:'Sign in required'},{status:401});
 if(ctx.workspace.role==='client'||!allowed(ctx.workspace.role,ctx.workspace.permissions??[],'finance_admin'))return NextResponse.json({error:'Finance administrator access required'},{status:403});
 const parsed=draft.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Enter a recipient, description and positive USD amount with at most two decimal places.'},{status:400});
 // The form keeps its UUID across retries so a timeout cannot create a duplicate draft.
 const {data:existing,error:readError}=await ctx.db.from('receipt_drafts').select('*').eq('tenant_id',ctx.workspace.id).eq('id',parsed.data.id).maybeSingle();
 if(readError)return NextResponse.json({error:'Could not check the draft. Please retry.'},{status:500});
 if(existing)return NextResponse.json(existing);
 const {data,error}=await ctx.db.from('receipt_drafts').insert({...parsed.data,tenant_id:ctx.workspace.id}).select().single();
 if(error?.code==='23505'){
  const {data:retry}=await ctx.db.from('receipt_drafts').select('*').eq('tenant_id',ctx.workspace.id).eq('id',parsed.data.id).maybeSingle();
  if(retry)return NextResponse.json(retry);
 }
 return NextResponse.json(error?{error:'Could not save the draft receipt. Please retry.'}:data,{status:error?500:201});
}
