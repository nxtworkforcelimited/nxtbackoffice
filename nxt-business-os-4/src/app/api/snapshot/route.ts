import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {modules} from '@/lib/types';
import {type BusinessData} from '@/lib/business';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));
 if(!ctx?.workspace)return NextResponse.json({error:'Please sign in again.'},{status:401});
 try{
 const pairs=await Promise.all(modules.map(async module=>{let q=ctx.db.from(module).select('*').eq('tenant_id',ctx.workspace!.id);if(['clients','projects','tasks'].includes(module))q=q.is('archived_at',null);const {data,error}=await q.order('created_at',{ascending:false});if(error)throw new Error(`Could not load ${module}: ${error.message}`);return [module,data??[]];}));
 const [items,comments,payments,rules,memberRows,grants]=await Promise.all([
 ctx.db.from('business_items').select('*').eq('tenant_id',ctx.workspace.id).order('created_at',{ascending:false}),
 ctx.db.from('content_comments').select('*').eq('tenant_id',ctx.workspace.id).order('created_at'),
 ctx.db.from('invoice_payments').select('*').eq('tenant_id',ctx.workspace.id),
 ctx.db.from('payroll_rules').select('rules').eq('tenant_id',ctx.workspace.id).maybeSingle(),
 ctx.db.from('memberships').select('user_id,role,client_id').eq('tenant_id',ctx.workspace.id),
 ctx.db.from('member_permissions').select('user_id,capability').eq('tenant_id',ctx.workspace.id)]);
 for(const result of [items,comments,payments,rules,memberRows,grants])if(result.error)throw new Error('Business workspace could not load. Check the migration and permissions.');
 const directory=await ctx.db.from('staff_directory').select('user_id,name,email').eq('tenant_id',ctx.workspace.id);
 const business:BusinessData={items:items.data??[],comments:comments.data??[],payments:payments.data??[],rules:rules.data?.rules??{},members:(memberRows.data??[]).map(m=>({...m,...(directory.data??[]).find(d=>d.user_id===m.user_id),permissions:(grants.data??[]).filter(g=>g.user_id===m.user_id).map(g=>g.capability)}))};
return NextResponse.json({data:Object.fromEntries(pairs),business,workspace:ctx.workspace},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'Updates could not load. Please refresh or check your connection.'},{status:500});}
}
