import {NextRequest} from 'next/server';
import {supabase} from '@/lib/supabase/server';
import {trustedRequest} from '@/lib/request-origin';
import {authRedirect,rejectedForm} from '@/lib/server/auth-response';
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return rejectedForm(req);
 try{const db=await supabase();await db.auth.signOut({scope:'local'});return authRedirect(req,'/login');}
 catch{return authRedirect(req,'/login','Sign-out could not be confirmed. Please retry when your connection returns.');}
}
