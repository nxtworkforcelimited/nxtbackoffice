import {NextRequest} from 'next/server';
import {supabase} from '@/lib/supabase/server';
import {cookies} from 'next/headers';
import {trustedRequest} from '@/lib/request-origin';
import {authRedirect,rejectedForm} from '@/lib/server/auth-response';
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return rejectedForm(req);
 try{
  const db=await supabase(),{data:{user}}=await db.auth.getUser(),jar=await cookies();
  if(!user||jar.get('nxt-client-setup')?.value!==user.id)return authRedirect(req,'/login','Your setup session expired. Ask NXT Workforce for a fresh password-setup link.');
  const f=await req.formData(),password=String(f.get('password')??''),confirm=String(f.get('confirm')??'');
  if(password.length<12||password.length>128)return authRedirect(req,'/auth/setup','Use a password between 12 and 128 characters.');
  if(password!==confirm)return authRedirect(req,'/auth/setup','The passwords do not match.');
  const {error}=await db.auth.updateUser({password});
  if(error)return authRedirect(req,'/auth/setup','The password was not accepted. Try a different password, or request a fresh setup link if your session expired.');
  const response=authRedirect(req,'/app');
  response.cookies.set('nxt-client-setup','',{httpOnly:true,secure:req.nextUrl.protocol==='https:',sameSite:'lax',path:'/auth',maxAge:0});
  return response;
 }catch{return authRedirect(req,'/auth/setup','We could not confirm the password update. Please try signing in, or request a new setup link.');}
}
