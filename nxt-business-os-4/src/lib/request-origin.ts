// Accept only the current origin or explicitly configured portal/deployment origins.
// Never trust arbitrary X-Forwarded-Host values as a CSRF allow-list.
export function trustedFormOrigin(request:Request, configuredOrigins:string[]=[]):boolean {
 const origins=new Set([new URL(request.url).origin]);
 for(const value of configuredOrigins){if(!value)continue;try{const u=new URL(value);if(u.protocol==='https:'||u.hostname==='localhost')origins.add(u.origin);}catch{/* Invalid configuration is not an allowed origin. */}}
 const origin=request.headers.get('origin');
 if(origin!==null)return origins.has(origin);
 // Some browser/email webviews omit Origin. Require an independent same-origin signal.
 const referer=request.headers.get('referer');
 if(referer){try{return origins.has(new URL(referer).origin);}catch{return false;}}
 return request.headers.get('sec-fetch-site')==='same-origin';
}
export function trustedRequest(request:Request):boolean {
 return trustedFormOrigin(request,[process.env.NEXT_PUBLIC_APP_URL??'',process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:'']);
}
