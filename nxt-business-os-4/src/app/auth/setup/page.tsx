import {redirect} from 'next/navigation';
import {cookies} from 'next/headers';
import {supabase} from '@/lib/supabase/server';
import type {Metadata} from 'next';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Choose your portal password',referrer:'no-referrer',robots:{index:false,follow:false}};
export default async function Setup({searchParams}:{searchParams:Promise<{error?:string}>}){
 const db=await supabase(),{data:{user}}=await db.auth.getUser();
 if(!user||(await cookies()).get('nxt-client-setup')?.value!==user.id)redirect('/login?error=Open%20your%20invitation%20email%20to%20set%20your%20password.');
 const error=(await searchParams).error;
 return <main className="login"><section className="login-story"><div className="brand-image"><img src="/brand/nxt-business-os.png" alt="NXT Business OS"/></div><div><h1>Welcome to NXT.</h1><p>Your private client workspace is ready for you.</p></div></section><section className="login-form"><div><h2>Choose your password</h2><p>Account: {user.email}</p>{error&&<p className="notice" role="alert">{error}</p>}<form action="/auth/set-password" method="post"><label>New password<input required name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128}/></label><label>Confirm password<input required name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128}/></label><p>Use at least 12 characters.</p><button className="primary">Save password and open portal</button></form></div></section></main>;
}
