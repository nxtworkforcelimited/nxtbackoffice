import {NextRequest,NextResponse} from 'next/server';import {context} from '@/lib/context';import {mode} from '@/lib/server/omari';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace)return NextResponse.json({error:'Sign in required'},{status:401});const m=mode();return NextResponse.json({mode:m,client_enabled:m==='production',test_number:m==='uat'?'263776988135':''},{headers:{'Cache-Control':'private, no-store'}});}
