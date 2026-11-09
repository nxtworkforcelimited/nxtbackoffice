import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {context} from '@/lib/context';
import {trustedRequest} from '@/lib/request-origin';
import {adminClient} from '@/lib/server/admin';
import {cleanHidden,menuSwitchKeys} from '@/lib/app-access';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});

// Menus the owner switched off for a staff member. A member reads their own list; only the owner reads or changes everyone's.
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c)return reply({error:'Please sign in.'},401);
 if(!c.workspace||c.workspace.role==='client')return reply({hidden:[]});
 const db=adminClient();if(!db)return reply({hidden:[]});
 const t=c.workspace.id;
 if(req.nextUrl.searchParams.get('all')==='1'){
  if(c.workspace.role!=='owner')return reply({error:'Only the workspace owner can open this.'},403);
  const [dir,mem,perms,hid]=await Promise.all([
   db.from('staff_directory').select('user_id,name,email,job_title').eq('tenant_id',t).order('name'),
   db.from('memberships').select('user_id,role').eq('tenant_id',t).in('role',['owner','admin','staff']),
   db.from('member_permissions').select('user_id,capability').eq('tenant_id',t),
   db.from('member_hidden_apps').select('user_id,app').eq('tenant_id',t)
  ]);
  if(dir.error||mem.error||perms.error)return reply({error:'Staff could not load.'},503);
  const role=new Map((mem.data??[]).map(m=>[m.user_id as string,m.role as string]));
  const staff=(dir.data??[]).filter(d=>role.has(d.user_id as string)).map(d=>({...d,role:role.get(d.user_id as string),caps:(perms.data??[]).filter(p=>p.user_id===d.user_id).map(p=>p.capability as string),hidden:(hid.data??[]).filter(h=>h.user_id===d.user_id).map(h=>h.app as string)}));
  return reply({staff});
 }
 const own=await db.from('member_hidden_apps').select('app').eq('tenant_id',t).eq('user_id',c.user.id);
 // The owner is never restricted, whatever the table holds.
 return reply({hidden:c.workspace.role==='owner'||own.error?[]:cleanHidden((own.data??[]).map(r=>r.app))});
}
const body=z.object({user_id:z.uuid(),app:z.string().refine(a=>menuSwitchKeys.includes(a)),hidden:z.boolean()}).strict();
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Open the back office directly and retry this request.'},403);
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c)return reply({error:'Please sign in.'},401);
 if(!c.workspace||c.workspace.role!=='owner')return reply({error:'Only the workspace owner can change what staff can see.'},403);
 const p=body.safeParse(await req.json().catch(()=>null));if(!p.success)return reply({error:'Choose a staff member and a menu.'},400);
 const db=adminClient();if(!db)return reply({error:'Not available right now.'},503);
 const t=c.workspace.id;
 const m=await db.from('memberships').select('role').eq('tenant_id',t).eq('user_id',p.data.user_id).maybeSingle();
 if(!m.data||!['staff','admin'].includes(m.data.role as string))return reply({error:'Choose a staff or admin member. The owner always sees everything.'},400);
 const out=p.data.hidden?await db.from('member_hidden_apps').upsert({tenant_id:t,user_id:p.data.user_id,app:p.data.app,hidden_by:c.user.id}):await db.from('member_hidden_apps').delete().eq('tenant_id',t).eq('user_id',p.data.user_id).eq('app',p.data.app);
 return reply(out.error?{error:'Could not save. The database upgrade (202611090010) may be missing.'}:{ok:true},out.error?400:200);
}
