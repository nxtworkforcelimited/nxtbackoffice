import { supabase } from '@/lib/supabase/server';
import { NextRequest,NextResponse } from 'next/server';
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return new Response('Forbidden',{status:403});
 const f=await req.formData();const email=String(f.get('email')??'');const password=String(f.get('password')??'');
 const db=await supabase();const {error}=await db.auth.signInWithPassword({email,password});
 return NextResponse.redirect(new URL(error?'/login?error=Sign-in%20failed.%20Check%20your%20credentials.':'/app',req.url),303);
}
