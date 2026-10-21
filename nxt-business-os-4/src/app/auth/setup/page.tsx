import {redirect} from 'next/navigation';
import {cookies} from 'next/headers';
import {supabase} from '@/lib/supabase/server';
import type {Metadata} from 'next';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Choose your portal password',referrer:'same-origin',robots:{index:false,follow:false}};
export default async function Setup({searchParams}:{searchParams:Promise<{error?:string}>}){
 const db=await supabase(),{data:{user},error:authError}=await db.auth.getUser();
 if(authError&&(authError.name==='AuthRetryableFetchError'||(authError.status??0)>=500))return <main className="login-form"><h1>Connection temporarily unavailable</h1><p>Your password has not been changed. Please refresh this page when your connection returns.</p><a href="/auth/setup">Try again</a></main>;
 if(!user||(await cookies()).get('nxt-client-setup')?.value!==user.id)redirect('/login?error=Open%20your%20latest%20password-setup%20email%20to%20continue.');
 const error=(await searchParams).error;
 return <main className="login"><section className="login-story"><div className="brand-image"><img src="/brand/nxt-business-os.png" alt="NXT Business OS"/></div><div><h1>Welcome to NXT.</h1><p>Your private client workspace is ready for you.</p></div></section><section className="login-form"><div><h2>Choose your password</h2><p>Account: {user.email}</p>{error&&<p className="notice" role="alert">{error}</p>}<form action="/auth/set-password" method="post"><label>New password<input required name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128}/></label><label>Confirm password<input required name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128}/></label><p>Use at least 12 characters. NXT staff cannot see your password.</p><button className="primary">Save password and open portal</button></form></div></section></main>;
}
