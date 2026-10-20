import { supabase } from '@/lib/supabase/server';
import { NextRequest,NextResponse } from 'next/server';
export async function POST(req:NextRequest){if(req.headers.get('origin')!==req.nextUrl.origin)return new Response('Forbidden',{status:403});const db=await supabase();await db.auth.signOut();return NextResponse.redirect(new URL('/login',req.url),303);}
