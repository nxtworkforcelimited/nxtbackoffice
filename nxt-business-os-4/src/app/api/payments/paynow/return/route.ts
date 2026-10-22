import {NextRequest,NextResponse} from 'next/server';
import {adminDb,appUrl,reconcilePaynowSession} from '@/lib/server/paynow';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const session=req.nextUrl.searchParams.get('session');let state='pending',workspace='';
 try{
  if(session){
   const result:any=await reconcilePaynowSession(session);state=String(result?.status??'pending').toLowerCase()==='paid'?'paid':['paid','awaiting delivery','delivered'].includes(String(result?.status??'').toLowerCase())?'paid':'pending';
   const db=adminDb(),{data}=await db.from('paynow_transactions').select('tenant_id').eq('id',session).single();workspace=data?.tenant_id??'';
  }
 }catch{state='pending';}
 const url=new URL('/app',appUrl());if(workspace)url.searchParams.set('workspace',workspace);url.searchParams.set('payment',state);return NextResponse.redirect(url);
}
