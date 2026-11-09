import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {trustedRequest} from '@/lib/request-origin';
import {analyzeHtml,summarise,type Check} from '@/lib/site-check';
import {fetchPublic} from '@/lib/server/site-fetch';
import {z} from 'zod';
export const dynamic='force-dynamic';
export const maxDuration=30;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});

export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Open the back office directly and retry.'},403);
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client'||!allowed(c.workspace.role,c.workspace.permissions??[],'tickets'))return reply({error:'IT administrator access required'},403);
 const p=z.object({id:z.uuid()}).strict().safeParse(await req.json().catch(()=>null));
 if(!p.success)return reply({error:'Choose a build to check.'},400);
 const build=await c.db.from('backoffice_builds').select('id,url').eq('tenant_id',c.workspace.id).eq('id',p.data.id).maybeSingle();
 if(!build.data)return reply({error:'Build not found.'},404);
 if(!build.data.url)return reply({error:'Add the live or staging URL to this build first, then save it.'},400);
 const checks:Check[]=[];
 try{
  const page=await fetchPublic(build.data.url);
  const final=new URL(page.url);
  checks.push(page.status>=200&&page.status<300?{key:'up',label:'Site is up',state:'pass',detail:'Answered with status '+page.status+' in '+page.ms+' ms.'}:{key:'up',label:'Site is up',state:'fail',detail:'Answered with status '+page.status+'.'});
  checks.push(final.protocol==='https:'?{key:'https',label:'Secure connection (HTTPS)',state:'pass',detail:'Final address uses https.'}:{key:'https',label:'Secure connection (HTTPS)',state:'fail',detail:'Final address is not https.'});
  if(page.status<400)checks.push(...analyzeHtml(page.body));
  checks.push(page.ms>4000?{key:'speed',label:'Response time',state:'warn',detail:'Took '+(page.ms/1000).toFixed(1)+' seconds to answer.'}:{key:'speed',label:'Response time',state:'pass',detail:page.ms+' ms'});
  for(const [key,label,path] of [['robots','robots.txt file','/robots.txt'],['sitemap','Sitemap (sitemap.xml)','/sitemap.xml']] as const){
   try{const f=await fetchPublic(final.origin+path);const ok=f.status===200&&f.body.trim().length>0&&!/<html/i.test(f.body.slice(0,300));checks.push(ok?{key,label,state:'pass',detail:'Found.'}:{key,label,state:'warn',detail:'Not found at '+path+'.'});}
   catch{checks.push({key,label,state:'warn',detail:'Not found at '+path+'.'});}
  }
 }catch(e){
  checks.push({key:'up',label:'Site is up',state:'fail',detail:(e as Error).message||'The site could not be reached.'});
 }
 const result={checked_at:new Date().toISOString(),url:build.data.url,checks,summary:summarise(checks)};
 const saved=await c.db.from('backoffice_builds').update({site_check:result,site_checked_at:result.checked_at}).eq('tenant_id',c.workspace.id).eq('id',p.data.id);
 return reply({...result,saved:!saved.error});
}
