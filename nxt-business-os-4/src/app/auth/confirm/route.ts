import {NextRequest,NextResponse} from 'next/server';
import {supabase} from '@/lib/supabase/server';
import {cookies} from 'next/headers';
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return new Response('Forbidden',{status:403});
 const f=await req.formData(),token_hash=String(f.get('token_hash')??''),type=String(f.get('type')??'');
 if(!/^[a-zA-Z0-9_-]{20,512}$/.test(token_hash)||(type!=='invite'&&type!=='recovery'))return NextResponse.redirect(new URL('/login?error=Invalid%20invitation.%20Ask%20NXT%20Workforce%20to%20resend%20it.',req.url),303);
 const db=await supabase();
 const {data,error}=await db.auth.verifyOtp({token_hash,type});
 if(error||!data.user)return NextResponse.redirect(new URL('/login?error=This%20invitation%20expired%20or%20was%20already%20used.%20Ask%20NXT%20Workforce%20to%20resend%20it.',req.url),303);
 (await cookies()).set('nxt-client-setup',data.user.id,{httpOnly:true,secure:req.nextUrl.protocol==='https:',sameSite:'lax',path:'/auth',maxAge:900});
 return NextResponse.redirect(new URL('/auth/setup',req.url),303);
}
