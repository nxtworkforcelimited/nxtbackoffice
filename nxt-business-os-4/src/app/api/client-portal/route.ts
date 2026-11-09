import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {portalAccess} from '@/lib/client-support';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});

// What this client's portal shows. Everything is off until NXT ticks it on the client record.
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c)return reply({error:'Please sign in.'},401);
 if(!c.workspace||c.workspace.role!=='client'||!c.workspace.client_id)return reply({error:'Client access required.'},403);
 const r=await c.db.from('clients').select('*').eq('tenant_id',c.workspace.id).eq('id',c.workspace.client_id).maybeSingle();
 if(r.error||!r.data)return reply(portalAccess([],[]));
 return reply(portalAccess(r.data.services,r.data.portal_features));
}
