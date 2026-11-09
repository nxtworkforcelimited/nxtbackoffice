import {isPreviewBot} from './tracking-classify';
export type TrackLink={id:string;client_id:string|null;campaign:string;source:string;medium:string;code:string};
export type TrackClick={campaign_id:string;clicked_at:string;user_agent:string|null;device:string|null;referrer:string|null;visitor_hash:string|null;visitor_user_id:string|null};
export const isHumanClick=(c:TrackClick)=>c.device!=='Bot'&&!isPreviewBot(c.user_agent||'');
const dayKey=(d:Date)=>d.toISOString().slice(0,10);
const host=(r:string|null)=>{if(!r)return 'Direct or unknown';try{return new URL(r).hostname.replace(/^www\./,'')||'Direct or unknown';}catch{return 'Direct or unknown';}};
function tally(map:Map<string,number>){return [...map.entries()].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));}
// Results for a set of links and the clicks on them. Preview robots are counted
// separately and never mixed into people. "Unique" counts distinct visitor
// fingerprints per link, so one person opening one link ten times is one visitor.
export function summariseTracking(links:TrackLink[],clicks:TrackClick[],days:number,now=new Date()){
 const linkById=new Map(links.map(l=>[l.id,l]));
 const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-(days-1)));
 const inRange=clicks.filter(c=>linkById.has(c.campaign_id)&&new Date(c.clicked_at)>=start);
 const human=inRange.filter(isHumanClick),bots=inRange.length-human.length;
 const perDay=new Map<string,number>();for(let i=0;i<days;i++)perDay.set(dayKey(new Date(start.getTime()+i*86400000)),0);
 const dev=new Map<string,number>(),ref=new Map<string,number>(),perLink=new Map<string,{clicks:number;unique:Set<string>;last:string}>();
 const allUnique=new Set<string>();
 for(const c of human){
  const k=dayKey(new Date(c.clicked_at));perDay.set(k,(perDay.get(k)||0)+1);
  dev.set(c.device||'Unknown',(dev.get(c.device||'Unknown')||0)+1);
  const h=host(c.referrer);ref.set(h,(ref.get(h)||0)+1);
  const who=c.visitor_hash||c.visitor_user_id||'click:'+c.clicked_at+c.campaign_id;
  allUnique.add(c.campaign_id+'|'+who);
  const row=perLink.get(c.campaign_id)||{clicks:0,unique:new Set<string>(),last:''};row.clicks++;row.unique.add(who);if(c.clicked_at>row.last)row.last=c.clicked_at;perLink.set(c.campaign_id,row);
 }
 const byLink=links.map(l=>{const r=perLink.get(l.id);return {id:l.id,client_id:l.client_id,campaign:l.campaign,source:l.source,medium:l.medium,code:l.code,clicks:r?.clicks||0,unique:r?.unique.size||0,last_click:r?.last||null};}).sort((a,b)=>b.clicks-a.clicks||a.campaign.localeCompare(b.campaign));
 return {days,clicks:human.length,unique:allUnique.size,bots_filtered:bots,by_day:[...perDay.entries()].map(([date,count])=>({date,count})),devices:tally(dev),referrers:tally(ref).slice(0,8),links:byLink};
}
