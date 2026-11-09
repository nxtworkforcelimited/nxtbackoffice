import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import {isPublicIp} from '@/lib/site-check';

export type Fetched={status:number;url:string;body:string;ms:number;truncated:boolean};
const MAX_BYTES=1_500_000,TIMEOUT=8000;

/** Fetch a public web page. Refuses private addresses, odd ports and credentials, and pins the checked IP for the connection. */
export async function fetchPublic(input:string,hops=3):Promise<Fetched>{
 let current=new URL(input);const started=Date.now();
 for(let i=0;i<=hops;i++){
  if(!/^https?:$/.test(current.protocol))throw new Error('Only http and https addresses can be checked.');
  if(current.username||current.password)throw new Error('Remove the username and password from the address.');
  if(current.port&&!['80','443'].includes(current.port))throw new Error('Only the standard web ports can be checked.');
  const host=current.hostname.replace(/^\[|\]$/g,'');
  const addrs=/^[\d.]+$|:/.test(host)?[{address:host,family:host.includes(':')?6:4}]:await dns.lookup(host,{all:true});
  if(!addrs.length||!addrs.every(a=>isPublicIp(a.address)))throw new Error('That address is not a public website.');
  const pinned=addrs[0];
  const res=await new Promise<{status:number;location:string;body:string;truncated:boolean}>((resolve,reject)=>{
   const lib=current.protocol==='https:'?https:http;
   const req=lib.request(current,{method:'GET',timeout:TIMEOUT,servername:host,headers:{'User-Agent':'NXT-Site-Check/1.0','Accept':'text/html,application/xhtml+xml,text/plain,*/*;q=0.5'},
    lookup:(_h,_o,cb)=>(cb as unknown as (e:null,a:string,f:number)=>void)(null,pinned.address,pinned.family)},r=>{
    const chunks:Buffer[]=[];let size=0,truncated=false;
    r.on('data',(d:Buffer)=>{size+=d.length;if(size>MAX_BYTES){truncated=true;req.destroy();return;}chunks.push(d);});
    const done=()=>resolve({status:r.statusCode??0,location:String(r.headers.location??''),body:Buffer.concat(chunks).toString('utf8'),truncated});
    r.on('end',done);r.on('close',done);r.on('error',reject);
   });
   req.on('timeout',()=>req.destroy(new Error('The site took too long to answer.')));
   req.on('error',reject);
   req.end();
  });
  if([301,302,303,307,308].includes(res.status)&&res.location){current=new URL(res.location,current);continue;}
  return {status:res.status,url:current.toString(),body:res.body,ms:Date.now()-started,truncated:res.truncated};
 }
 throw new Error('Too many redirects.');
}
