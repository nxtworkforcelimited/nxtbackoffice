import {NextRequest} from 'next/server';
import {context} from '@/lib/context';
import {configured} from '@/lib/supabase/server';
import {masterTrackerResponse} from '@/lib/server/master-tracker';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (!configured()) return Response.json({error: 'Workspace connection is unavailable.'}, {status: 503, headers: {'Cache-Control': 'private, no-store'}});
  try {
    return await masterTrackerResponse(request.nextUrl.searchParams.get('workspace'), context);
  } catch {
    return Response.json({error: 'Access could not be verified. Please retry.'}, {status: 503, headers: {'Cache-Control': 'private, no-store'}});
  }
}
