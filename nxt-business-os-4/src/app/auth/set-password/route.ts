import {NextRequest,NextResponse} from 'next/server';
import {supabase} from '@/lib/supabase/server';
import {cookies} from 'next/headers';
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return new Response('Forbidden',{status:403});
 const db=await supabase(),{data:{user}}=await db.auth.getUser(),jar=await cookies();
 if(!user||jar.get('nxt-client-setup')?.value!==user.id)return NextResponse.redirect(new URL('/login?error=Open%20your%20invitation%20email%20to%20continue.',req.url),303);
 const f=await req.formData(),password=String(f.get('password')??''),confirm=String(f.get('confirm')??'');
 const fail=(message:string)=>NextResponse.redirect(new URL('/auth/setup?error='+encodeURIComponent(message),req.url),303);
 if(password.length<12||password.length>128)return fail('Use a password between 12 and 128 characters.');
 if(password!==confirm)return fail('The passwords do not match.');
 const {error}=await db.auth.updateUser({password});
 if(error)return fail('The password was not accepted. Try a different password, or ask NXT Workforce to resend the invitation if your session expired.');
 jar.set('nxt-client-setup','',{httpOnly:true,secure:req.nextUrl.protocol==='https:',sameSite:'lax',path:'/auth',maxAge:0});
 return NextResponse.redirect(new URL('/app',req.url),303);
}
