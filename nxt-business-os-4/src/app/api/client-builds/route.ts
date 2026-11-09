import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {context} from '@/lib/context';
import {toClientBuild} from '@/lib/client-sites';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});

// Websites and back offices NXT shows this client. Only builds NXT switched on ("Show on the client's portal") for this client.
// The workspace and client come from the signed-in membership, never from the request. Only toClientBuild fields are returned:
// no internal notes, tasks, team names, test results or review notes.
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c)return reply({error:'Please sign in.'},401);
 if(!c.workspace||c.workspace.role!=='client'||!c.workspace.client_id)return reply({error:'Client access required.'},403);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return reply({error:'Not available right now.'},503);
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const q=await admin.from('backoffice_builds').select('*').eq('tenant_id',c.workspace.id).eq('client_id',c.workspace.client_id).eq('client_visible',true).is('archived_at',null).order('created_at',{ascending:false}).limit(20);
 // Before the 0009 upgrade the columns do not exist: nothing is shown.
 if(q.error)return reply({builds:[]});
 return reply({builds:(q.data??[]).map(r=>toClientBuild(r as Record<string,unknown>))});
}
