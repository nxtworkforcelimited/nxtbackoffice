import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {capabilities} from '@/lib/business';
import {z} from 'zod';
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));const accessAdmin=!!ctx?.workspace&&(['owner','admin'].includes(ctx.workspace.role)||(ctx.workspace.permissions??[]).includes('hr'));if(!ctx?.workspace||!accessAdmin)return NextResponse.json({error:'Access administration permission required'},{status:403});
 const p=z.object({user_id:z.uuid(),capability:z.enum(capabilities),enabled:z.boolean()}).safeParse(await req.json().catch(()=>null));
 if(!p.success)return NextResponse.json({error:'Invalid permission'},{status:400});
 const member=await ctx.db.from('memberships').select('role').eq('tenant_id',ctx.workspace.id).eq('user_id',p.data.user_id).single();
 if(!member.data||!['staff','admin'].includes(member.data.role))return NextResponse.json({error:'Select an existing staff or admin member'},{status:400});
 const q={tenant_id:ctx.workspace.id,user_id:p.data.user_id,capability:p.data.capability};
 const {error}=p.data.enabled?await ctx.db.from('member_permissions').upsert(q):await ctx.db.from('member_permissions').delete().match(q);
 return NextResponse.json(error?{error:'Permission update failed'}:{ok:true},{status:error?400:200});
}
