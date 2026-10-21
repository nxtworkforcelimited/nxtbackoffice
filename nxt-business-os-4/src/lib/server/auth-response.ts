import {NextResponse} from 'next/server';
export function authRedirect(request:Request,path:string,error?:string){
 // Only application-controlled relative paths are passed to this helper.
 const url=new URL(path,request.url);if(error)url.searchParams.set('error',error);
 const response=NextResponse.redirect(url,303);
 response.headers.set('Cache-Control','private, no-store');
 response.headers.set('Referrer-Policy','no-referrer');
 return response;
}
export function rejectedForm(request:Request){return authRedirect(request,'/login','This form could not be verified. Open the portal directly in your browser and try again. No changes were made.');}
