import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export function configured() { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); }
export async function supabase() {
 if (!configured()) throw new Error('Supabase is not configured. Follow README.md.');
 const jar = await cookies();
 return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {cookies: {
 getAll: () => jar.getAll(), setAll: values => { try { values.forEach(({name,value,options})=>jar.set(name,value,options)); } catch { /* Server component: proxy persists refreshed cookies. */ } }
 }});
}
