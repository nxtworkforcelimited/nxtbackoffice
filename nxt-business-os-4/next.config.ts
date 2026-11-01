import type { NextConfig } from 'next';
import {siteFiles,v6Files} from './src/lib/v6-page-map';
const security=[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'}];
const config: NextConfig = {
  poweredByHeader:false,
  outputFileTracingIncludes:{'/api/site-bridge':['./content/v6/**/*.html'],'/api/site-bridge/**':['./content/v6/**/*.html']},
  async redirects(){
    return Object.entries(v6Files).map(([destination,file])=>({source:'/'+file,destination,permanent:true}));
  },
  async rewrites(){
    return {beforeFiles:Object.keys(siteFiles).map(source=>({source,destination:source==='/'?'/api/site-bridge':'/api/site-bridge/pages'+source})),afterFiles:[],fallback:[]};
  },
  async headers(){
    return [
      {source:'/login',headers:[...security,{key:'Cache-Control',value:'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'},{key:'Pragma',value:'no-cache'},{key:'Expires',value:'0'}]},
      {source:'/:path*',headers:security}
    ];
  }
};
export default config;
