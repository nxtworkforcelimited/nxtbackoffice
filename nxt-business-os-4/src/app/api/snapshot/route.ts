import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {modules} from '@/lib/types';
import {type BusinessData} from '@/lib/business';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){
 try{
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));
 if(!ctx)return reply({error:'Your sign-in session has expired. Please sign in again.',code:'SESSION_REQUIRED'},401);
 if(!ctx.workspace)return reply({error:'Your account is signed in but is not linked to this workspace. Select another workspace or contact your administrator.',code:'WORKSPACE_REQUIRED'},403);
 const pairs=await Promise.all(modules.map(async module=>{let q=ctx.db.from(module).select('*').eq('tenant_id',ctx.workspace!.id);if(['clients','projects','tasks'].includes(module))q=q.is('archived_at',null);const {data,error}=await q.order('created_at',{ascending:false});if(error){console.warn('Workspace snapshot read failed',{module,code:error.code});throw new Error('Workspace data temporarily unavailable.');}return [module,data??[]];}));
 const [items,comments,payments,rules,memberRows,grants]=await Promise.all([
 ctx.db.from('business_items').select('*').eq('tenant_id',ctx.workspace.id).is('deleted_at',null).order('created_at',{ascending:false}),
 ctx.db.from('content_comments').select('*').eq('tenant_id',ctx.workspace.id).order('created_at'),
 ctx.db.from('invoice_payments').select('*').eq('tenant_id',ctx.workspace.id),
 ctx.db.from('payroll_rules').select('rules').eq('tenant_id',ctx.workspace.id).maybeSingle(),
 ctx.db.from('memberships').select('user_id,role,client_id').eq('tenant_id',ctx.workspace.id),
 ctx.db.from('member_permissions').select('user_id,capability').eq('tenant_id',ctx.workspace.id)]);
 for(const [index,result] of [items,comments,payments,rules,memberRows,grants].entries())if(result.error){console.warn('Business snapshot read failed',{query:index,code:result.error.code});throw new Error('Workspace data temporarily unavailable.');}
 const directory=await ctx.db.from('staff_directory').select('user_id,name,email').eq('tenant_id',ctx.workspace.id);
 const invoiceReviewer=await ctx.db.from('accounting_reviewers').select('user_id').eq('tenant_id',ctx.workspace.id).eq('user_id',ctx.user.id).maybeSingle();
 const business:BusinessData={canRemoveInvoices:!invoiceReviewer.error&&!!invoiceReviewer.data,items:items.data??[],comments:comments.data??[],payments:payments.data??[],rules:rules.data?.rules??{},members:(memberRows.data??[]).map(m=>({...m,...(directory.data??[]).find(d=>d.user_id===m.user_id),permissions:(grants.data??[]).filter(g=>g.user_id===m.user_id).map(g=>g.capability)}))};
 return reply({data:Object.fromEntries(pairs),business,workspace:ctx.workspace});
 }catch{return reply({error:'Updates are temporarily unavailable. Your account has not been signed out. Please retry when your connection returns.',code:'TEMPORARILY_UNAVAILABLE'},503);}
}
