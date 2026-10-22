import {NextRequest} from 'next/server';
import {context} from '@/lib/context';
import {configured} from '@/lib/supabase/server';
import {trustedRequest} from '@/lib/request-origin';
import {masterTrackerResponse,masterTrackerWrite} from '@/lib/server/master-tracker';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (!configured()) return Response.json({error: 'Workspace connection is unavailable.'}, {status: 503, headers: {'Cache-Control': 'private, no-store'}});
  try {
    return await masterTrackerResponse(request.nextUrl.searchParams.get('workspace'), context, {
      workspaceId:process.env.MASTER_TRACKER_WORKSPACE_ID,
      sitesToken:process.env.MASTER_TRACKER_SITES_TOKEN,
      feedSecret:process.env.MASTER_TRACKER_FEED_SECRET,
    });
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
 return masterTrackerWrite(request.nextUrl.searchParams.get('workspace'),body,context,{workspaceId:process.env.MASTER_TRACKER_WORKSPACE_ID,sitesToken:process.env.MASTER_TRACKER_SITES_TOKEN,writeSecret:process.env.MASTER_TRACKER_WRITE_SECRET});
}
