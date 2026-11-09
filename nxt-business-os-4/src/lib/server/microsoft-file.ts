import {isMicrosoftHost,microsoftDownloadCandidates} from '@/lib/microsoft-links';
const MAX=3*1024*1024;
async function get(url:string){
 let current=url;
 for(let hop=0;hop<6;hop++){
  const u=new URL(current);if(u.protocol!=='https:'||!isMicrosoftHost(u.hostname))throw Error('The link redirected somewhere that is not OneDrive or SharePoint.');
  const res=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'NXT-Business-OS-import'}});
  if([301,302,303,307,308].includes(res.status)){const loc=res.headers.get('location');if(!loc)throw Error('Link could not be followed.');current=new URL(loc,current).toString();continue;}
  return res;
 }
 throw Error('Link redirected too many times.');
}
// Downloads one shared Excel or CSV file. Only OneDrive and SharePoint addresses are contacted, at every redirect.
export async function fetchMicrosoftFile(link:string):Promise<File>{
 let lastError='';
 for(const candidate of microsoftDownloadCandidates(link)){
  try{
   const res=await get(candidate);
   if(!res.ok){lastError='status '+res.status;continue;}
   const declared=Number(res.headers.get('content-length')||0);if(declared>MAX)throw Error('That file is larger than 3 MB. Split it into smaller lists.');
   const buf=Buffer.from(await res.arrayBuffer());if(buf.length>MAX)throw Error('That file is larger than 3 MB. Split it into smaller lists.');if(!buf.length)continue;
   if(buf.subarray(0,4).toString('hex')==='504b0304')return new File([buf],'shared.xlsx');
   const type=res.headers.get('content-type')||'';
   if(/csv|text\/plain/i.test(type)&&!buf.subarray(0,200).toString('utf8').toLowerCase().includes('<html'))return new File([buf],'shared.csv');
   lastError='not a spreadsheet';
  }catch(e){if(/larger than 3 MB/.test((e as Error).message))throw e;lastError=(e as Error).message;}
 }
 throw Error('That link could not be opened ('+lastError+'). In Excel or OneDrive choose Share, set it to "Anyone with the link can view", copy the link and try again.');
}
