import { supabase } from './supabase/server';
import type { Workspace } from './types';
export async function context(tenant?:string|null) {
 const db=await supabase(); const {data:{user}}=await db.auth.getUser();
 if(!user) return null;
 const {data,error}=await db.from('memberships').select('tenant_id,role,client_id,tenants(id,name)').eq('user_id',user.id).order('created_at');
 if(error) throw new Error(error.message);
 const {data:grants,error:permissionError}=await db.from('member_permissions').select('tenant_id,user_id,capability').eq('user_id',user.id);
 if(permissionError)throw new Error('Run the business workspace migration before opening this version.');
 const spaces:Workspace[]=(data??[]).map(m=>{const t=m.tenants as unknown as {id:string;name:string};return {id:m.tenant_id,name:t.name,role:m.role,client_id:m.client_id,permissions:(grants??[]).filter(g=>g.tenant_id===m.tenant_id).map(g=>g.capability)};});
 const workspace=tenant?spaces.find(s=>s.id===tenant):spaces[0];
 return {db,user,spaces,workspace};
}
