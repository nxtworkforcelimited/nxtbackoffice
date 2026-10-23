import type { NextConfig } from 'next';
import {v6Files} from './src/lib/v6-page-map';
const security=[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'}];
const config: NextConfig = {
  poweredByHeader:false,
  async rewrites(){
    return {beforeFiles:Object.keys(v6Files).map(source=>({source,destination:'/api/site-bridge?path='+encodeURIComponent(source)})),afterFiles:[],fallback:[]};
  },
  async headers(){
    return [
      {source:'/login',headers:[...security,{key:'Cache-Control',value:'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'},{key:'Pragma',value:'no-cache'},{key:'Expires',value:'0'}]},
      {source:'/:path*',headers:security}
    ];
  }
};
export default config;
