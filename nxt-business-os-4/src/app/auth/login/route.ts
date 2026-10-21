import {NextRequest} from 'next/server';
import {supabase} from '@/lib/supabase/server';
import {trustedRequest} from '@/lib/request-origin';
import {authRedirect,rejectedForm} from '@/lib/server/auth-response';
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return rejectedForm(req);
 try{
  const form=await req.formData(),email=String(form.get('email')??'').trim(),password=String(form.get('password')??'');
  if(!email||email.length>254||!password||password.length>128)return authRedirect(req,'/login','Enter your email address and password.');
  const db=await supabase();const {error}=await db.auth.signInWithPassword({email,password});
  if(error)return authRedirect(req,'/login',error.status&&error.status>=500?'Sign-in is temporarily unavailable. Please try again shortly.':'Sign-in failed. Check your email and password, or ask NXT Workforce for a password-reset link.');
  return authRedirect(req,'/app');
 }catch{return authRedirect(req,'/login','Sign-in could not be completed. Check your connection and try again.');}
}
