import type { NextConfig } from 'next';
const security=[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'}];
const config: NextConfig = {
  poweredByHeader:false,
  async headers(){
    return [
      {source:'/login',headers:[...security,{key:'Cache-Control',value:'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'},{key:'Pragma',value:'no-cache'},{key:'Expires',value:'0'}]},
      {source:'/:path*',headers:security}
    ];
  }
};
export default config;
