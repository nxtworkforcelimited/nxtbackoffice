import {NextRequest,NextResponse} from 'next/server';
import {parseBody,reconcilePaynowSession,validHash} from '@/lib/server/paynow';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
 try{
  const session=req.nextUrl.searchParams.get('session');if(!session)return new NextResponse('Missing session',{status:400});
  const fields=parseBody(await req.text());if(!validHash(fields))return new NextResponse('Invalid signature',{status:400});
  await reconcilePaynowSession(session,fields);return new NextResponse('OK',{status:200});
 }catch{return new NextResponse('Could not process payment update',{status:500});}
}
