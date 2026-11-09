import {createClient} from '@supabase/supabase-js';
/** Service-role client for server routes that check the caller themselves first. Returns null when not configured. */
export function adminClient(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
}
