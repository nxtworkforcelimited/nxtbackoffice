import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {trustedRequest} from '@/lib/request-origin';
import {z} from 'zod';

export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});

const channelMap:Record<string,{source:string;medium:string;offline?:boolean;campaign?:string}>={
 'facebook-post':{source:'facebook',medium:'social'},
 'facebook-reel':{source:'facebook',medium:'social'},
 'instagram-post':{source:'instagram',medium:'social'},
 'instagram-reel':{source:'instagram',medium:'social'},
 'instagram-story':{source:'instagram',medium:'social'},
 'linkedin-post':{source:'linkedin',medium:'social'},
 'linkedin-article':{source:'linkedin',medium:'social'},
 'twitter-post':{source:'twitter',medium:'social'},
 'tiktok-video':{source:'tiktok',medium:'social'},
 'youtube-description':{source:'youtube',medium:'video'},
 'whatsapp-status':{source:'whatsapp',medium:'social'},
 'whatsapp-group':{source:'whatsapp',medium:'social'},
 'whatsapp-broadcast':{source:'whatsapp',medium:'social'},
 'whatsapp-channel':{source:'whatsapp',medium:'social'},
 'whatsapp-chat':{source:'whatsapp',medium:'social'},
 'newsletter':{source:'newsletter',medium:'email'},
 'sales-outreach':{source:'outreach',medium:'email'},
 'email-signature':{source:'email-signature',medium:'email',campaign:'always-on-signature'},
 'sms':{source:'sms',medium:'sms'},
 'flyer':{source:'flyer',medium:'qr',offline:true},
 'poster':{source:'poster',medium:'qr',offline:true},
 'banner':{source:'banner',medium:'qr',offline:true},
 'business-card':{source:'business-card',medium:'qr',offline:true},
 'brochure':{source:'brochure',medium:'qr',offline:true},
 'vehicle':{source:'vehicle',medium:'qr',offline:true},
 'billboard':{source:'billboard',medium:'qr',offline:true},
 'packaging':{source:'packaging',medium:'qr',offline:true},
 'receipt':{source:'receipt',medium:'qr',offline:true},
 'event-stand':{source:'event-stand',medium:'qr',offline:true},
 'tv-advert':{source:'tv-advert',medium:'qr',offline:true},
 'google-business-profile':{source:'google',medium:'organic',campaign:'always-on-gbp'},
 'linkedin-ad':{source:'linkedin',medium:'paid-social'},
 'tiktok-ad':{source:'tiktok',medium:'paid-social'},
 'twitter-ad':{source:'twitter',medium:'paid-social'},
 'radio':{source:'radio',medium:'audio'},
 'podcast':{source:'podcast',medium:'audio'},
 'partner-referral':{source:'partner',medium:'referral'},
 'influencer-affiliate':{source:'creator',medium:'affiliate'}
};
const clean=(value:string)=>value.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const input=z.object({
 business_name:z.string().trim().min(1).max(160).default('NXT Workforce'),
 business_code:z.string().trim().min(2).max(20).default('nxw'),
 client_id:z.uuid().nullable().optional(),
 destination_url:z.string().url().max(4000),
 campaign_name:z.string().trim().min(1).max(120),
 start_month:z.string().regex(/^\d{4}-\d{2}$/).optional(),
 channel:z.string().trim().min(1).max(80),
 placement:z.string().trim().max(120).default(''),
 creative:z.string().trim().max(120).default(''),
 utm_term:z.string().trim().max(120).default(''),
 notes:z.string().trim().max(1000).default('')
}).strict();

function sameSite(a:URL,b:URL){return a.hostname.replace(/^www\./,'')===b.hostname.replace(/^www\./,'');}
function campaignValue(name:string,startMonth?:string,fixed?:string){
 if(fixed)return fixed;
 const slug=clean(name);if(/^\d{4}-\d{2}-[a-z0-9-]+$/.test(slug))return slug.slice(0,40);if(slug.startsWith('always-on-'))return slug.slice(0,40);
 if(!startMonth)throw Error('Choose the campaign start month.');
 return clean(startMonth+'-'+slug).slice(0,40);
}
function finalUrl(destination:string,source:string,medium:string,campaign:string,content:string,term:string){
 const url=new URL(destination);
 [...url.searchParams.keys()].filter(k=>k.toLowerCase().startsWith('utm_')).forEach(k=>url.searchParams.delete(k));
 url.searchParams.set('utm_source',source);
 url.searchParams.set('utm_medium',medium);
 url.searchParams.set('utm_campaign',campaign);
 if(content)url.searchParams.set('utm_content',content);
 if(term)url.searchParams.set('utm_term',term);
 return url.toString();
}

export async function GET(req:NextRequest){
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace)return reply({error:'Sign in required'},401);
  const [links,clients]=await Promise.all([
   c.db.from('utm_links').select('*').eq('tenant_id',c.workspace.id).order('created_at',{ascending:false}).limit(300),
   c.db.from('clients').select('id,title').eq('tenant_id',c.workspace.id).is('archived_at',null).order('title')
  ]);
  if(links.error)throw links.error;if(clients.error)throw clients.error;
  return reply({links:links.data??[],clients:clients.data??[],channels:channelMap});
 }catch(e){return reply({error:(e as Error).message||'Link Builder could not load'},500);}
}

export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Forbidden'},403);
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client')return reply({error:'Staff access required'},403);
  const parsed=input.safeParse(await req.json().catch(()=>null));if(!parsed.success)return reply({error:parsed.error.issues.map(i=>i.message).join('; ')},400);
  const p=parsed.data,def=channelMap[p.channel];
  if(!def)return reply({error:'That channel is not in the approved UTM dictionary yet.'},400);
  if(p.channel==='google-ads')return reply({error:'Google Ads must use auto-tagging. Do not add UTMs.'},400);
  const destination=new URL(p.destination_url);
  const businessHome=p.client_id?null:new URL('https://www.nxt-workforce.com');
  if(businessHome&&sameSite(destination,businessHome)&&destination.pathname!=='/'&&req.headers.get('referer')){
   const ref=new URL(req.headers.get('referer')!);
   if(sameSite(ref,destination))return reply({error:'Do not tag links between pages of the same website. It overwrites the visitor source in GA4.'},400);
  }
  const campaign=campaignValue(p.campaign_name,p.start_month,def.campaign);
  const content=clean(p.creative||p.placement);
  const term=clean(p.utm_term);
  const final=finalUrl(p.destination_url,def.source,def.medium,campaign,content,term);
  const row=await c.db.from('utm_links').insert({
   tenant_id:c.workspace.id,business_name:p.business_name,business_code:clean(p.business_code),destination_url:p.destination_url,
   campaign,channel:p.channel,placement:clean(p.placement),utm_source:def.source,utm_medium:def.medium,utm_content:content,
   utm_term:term,final_url:final,qr_requested:Boolean(def.offline),client_id:p.client_id??null,created_by:c.user.id,notes:p.notes
  }).select('*').single();
  if(row.error)throw row.error;
  const qrPng='https://quickchart.io/qr?size=1200&margin=4&ecLevel=M&text='+encodeURIComponent(final);
  const qrSvg='https://quickchart.io/qr?format=svg&size=1200&margin=4&ecLevel=M&text='+encodeURIComponent(final);
  return reply({...row.data,qr_png:def.offline?qrPng:null,qr_svg:def.offline?qrSvg:null},201);
 }catch(e){return reply({error:(e as Error).message||'Tracking link could not be created'},400);}
}
