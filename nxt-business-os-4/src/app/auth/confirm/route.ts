import {NextRequest} from 'next/server';
import {supabase} from '@/lib/supabase/server';
import {trustedRequest} from '@/lib/request-origin';
import {authRedirect,rejectedForm} from '@/lib/server/auth-response';
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return rejectedForm(req);
 try{
  const f=await req.formData(),token_hash=String(f.get('token_hash')??''),type=String(f.get('type')??'');
  if(!/^[a-zA-Z0-9_-]{20,512}$/.test(token_hash)||(type!=='invite'&&type!=='recovery'))return authRedirect(req,'/login','Invalid invitation. Ask NXT Workforce to resend it.');
  const db=await supabase();const {data,error}=await db.auth.verifyOtp({token_hash,type});
  if(error||!data.user)return authRedirect(req,'/login','This link expired or was already used. Ask NXT Workforce for a new password-setup link.');
  const response=authRedirect(req,'/auth/setup');
  response.cookies.set('nxt-client-setup',data.user.id,{httpOnly:true,secure:req.nextUrl.protocol==='https:',sameSite:'lax',path:'/auth',maxAge:1800});
  return response;
 }catch{return authRedirect(req,'/login','Password setup is temporarily unavailable. Please reopen your latest invitation and try again.');}
}
