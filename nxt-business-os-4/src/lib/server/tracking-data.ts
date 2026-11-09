import type {TrackLink,TrackClick} from '@/lib/tracking-stats';
// Loads tracked links and their clicks through the caller's own database session,
// so a client login only ever receives rows for its own client (existing RLS).
export async function loadTracking(c:any,tenant:string,opts:{clientId?:string|null;days:number}){
 let lq=c.db.from('tracking_campaigns').select('id,client_id,code,source,medium,campaign').eq('tenant_id',tenant).order('created_at',{ascending:false}).limit(1000);
 if(opts.clientId)lq=lq.eq('client_id',opts.clientId);
 const links=await lq;if(links.error)throw links.error;
 const since=new Date(Date.now()-opts.days*86400000).toISOString(),clicks:TrackClick[]=[];
 for(let from=0;from<20000;from+=1000){
  let q=c.db.from('tracking_clicks').select('campaign_id,clicked_at,user_agent,device,referrer,visitor_hash,visitor_user_id').eq('tenant_id',tenant).gte('clicked_at',since).order('clicked_at',{ascending:false}).range(from,from+999);
  if(opts.clientId)q=q.eq('client_id',opts.clientId);
  const r=await q;if(r.error)throw r.error;clicks.push(...r.data);if(r.data.length<1000)break;
 }
 return {links:links.data as TrackLink[],clicks};
}
