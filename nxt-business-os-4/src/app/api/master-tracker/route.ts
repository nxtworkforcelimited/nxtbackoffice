import {NextRequest} from 'next/server';
import {context} from '@/lib/context';
import {configured} from '@/lib/supabase/server';
import {trustedRequest} from '@/lib/request-origin';
import {z} from 'zod';
import type {TrackerSnapshot,TrackerProject} from '@/lib/master-tracker';
import {masterTrackerResponse,masterTrackerWrite} from '@/lib/server/master-tracker';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (!configured()) return Response.json({error: 'Workspace connection is unavailable.'}, {status: 503, headers: {'Cache-Control': 'private, no-store'}});
  try {
    const workspace=request.nextUrl.searchParams.get('workspace'),c=await context(workspace);
    if(!c?.workspace||!c.user)return Response.json({error:'Sign in to continue.'},{status:401});
    if(!['owner','admin','staff'].includes(c.workspace.role))return Response.json({error:'Internal staff access required.'},{status:403});
    const native=await c.db.rpc('internal_tracker_snapshot',{t:c.workspace.id});
    if(native.error)return Response.json({error:'Internal trackers could not refresh. Please retry.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
    const response=await masterTrackerResponse(workspace,async()=>c,{
      workspaceId:process.env.MASTER_TRACKER_WORKSPACE_ID,sitesToken:process.env.MASTER_TRACKER_SITES_TOKEN,feedSecret:process.env.MASTER_TRACKER_FEED_SECRET,
    });
    if([401,403].includes(response.status)&&c.workspace.id===process.env.MASTER_TRACKER_WORKSPACE_ID)return response;
    let snapshot:TrackerSnapshot;
    if(response.ok)snapshot=await response.json();
    else snapshot={version:1,checkedAt:new Date().toISOString(),complete:false,projects:c.workspace.id===process.env.MASTER_TRACKER_WORKSPACE_ID?['Pack Easy','Kavi.R','Digital Safety Nest'].map((name,i)=>({id:['packeasy','kavir','cyber'][i],name,available:false,checkedAt:null,error:'Source tracker could not refresh.'})):[]};
    snapshot.projects.push(...native.data as TrackerProject[]);snapshot.complete=snapshot.projects.every(p=>p.available);
    return Response.json(snapshot,{headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
  } catch {
    return Response.json({error: 'Access could not be verified. Please retry.'}, {status: 503, headers: {'Cache-Control': 'private, no-store'}});
  }
}

export async function POST(request:NextRequest){
 const headers={'Cache-Control':'private, no-store'};
 if(!trustedRequest(request))return Response.json({error:'Use the Business OS form to save changes.'},{status:403,headers});
 if(!configured())return Response.json({error:'Workspace connection is unavailable.'},{status:503,headers});
 if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'Use JSON.'},{status:415,headers});
 const raw=await request.text();if(raw.length>250000)return Response.json({error:'Use a smaller brief.'},{status:413,headers});
 let body;try{body=JSON.parse(raw);}catch{return Response.json({error:'Invalid update.'},{status:422,headers});}
 if(typeof body.project==='string'&&body.project.startsWith('native:')){
  const c=await context(request.nextUrl.searchParams.get('workspace'));if(!c?.workspace||!['owner','admin','staff'].includes(c.workspace.role))return Response.json({error:'Internal staff access required.'},{status:403,headers});
  if(body.action!=='update'||body.kind!=='tasks'||!z.uuid().safeParse(body.project.slice(7)).success||!z.uuid().safeParse(body.id).success||!Number.isInteger(body.version))return Response.json({error:'Invalid tracker task update.'},{status:422,headers});
  const result=await c.db.rpc('update_internal_tracker_task',{t:c.workspace.id,tr:body.project.slice(7),r:body.id,expected_version:body.version,changes:body.changes});return Response.json(result.error?{error:result.error.message}:result.data,{status:result.error?409:200,headers});
 }
 return masterTrackerWrite(request.nextUrl.searchParams.get('workspace'),body,context,{workspaceId:process.env.MASTER_TRACKER_WORKSPACE_ID,sitesToken:process.env.MASTER_TRACKER_SITES_TOKEN,writeSecret:process.env.MASTER_TRACKER_WRITE_SECRET});
}
