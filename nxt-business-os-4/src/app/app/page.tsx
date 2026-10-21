import { redirect } from 'next/navigation';
import { configured } from '@/lib/supabase/server';
import { context } from '@/lib/context';
import { modules, type Data } from '@/lib/types';
import {type BusinessData} from '@/lib/business';
import Dashboard from '@/components/dashboard';
import WorkspaceShortcuts from '@/components/workspace-shortcuts';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{workspace?:string}>}){
 if(!configured())redirect('/login');
 const ctx=await context((await searchParams).workspace);
 if(!ctx)redirect('/login');
 if(!ctx.workspace)return <main className="setup"><h1>Workspace access needed</h1><p>Your account is authenticated, but no workspace membership matches this request. Ask your NXT administrator to provision access.</p><a href="/app">Use default workspace</a><form action="/auth/signout" method="post"><button>Sign out</button></form></main>;
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
 return <><WorkspaceShortcuts workspace={ctx.workspace}/><Dashboard business={business} initial={Object.fromEntries(pairs) as Data} workspace={ctx.workspace} workspaces={ctx.spaces} email={ctx.user.email??''}/></>;
}
