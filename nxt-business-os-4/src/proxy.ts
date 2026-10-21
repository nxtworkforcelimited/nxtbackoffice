import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';
export async function proxy(request:NextRequest){
 let response=NextResponse.next({request});
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)return response;
 const db=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{
  getAll:()=>request.cookies.getAll(),
  setAll:values=>{
   values.forEach(({name,value})=>request.cookies.set(name,value));
   const next=NextResponse.next({request});
   response.cookies.getAll().forEach(cookie=>next.cookies.set(cookie));
   values.forEach(({name,value,options})=>next.cookies.set(name,value,options));response=next;
  }
 }});
 // Refresh expired tokens and pass refreshed cookies both upstream and back to the browser.
 // Route handlers still verify users and tenant membership before accessing application data.
 try{await db.auth.getClaims();}catch{console.warn('Auth refresh temporarily unavailable');}
 response.headers.set('Cache-Control','private, no-store');
 return response;
}
export const config={matcher:['/app/:path*','/api/:path*','/auth/:path*','/login']};
