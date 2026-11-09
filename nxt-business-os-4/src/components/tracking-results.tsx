'use client';
import {useEffect,useState} from 'react';
type Summary={days:number;clicks:number;unique:number;bots_filtered:number;by_day:{date:string;count:number}[];devices:{label:string;count:number}[];referrers:{label:string;count:number}[];links:{id:string;campaign:string;source:string;medium:string;code:string;clicks:number;unique:number;last_click:string|null}[]};
const sample:Summary={days:30,clicks:278,unique:211,bots_filtered:34,by_day:Array.from({length:30},(_,i)=>({date:new Date(Date.UTC(2026,9,11+i)).toISOString().slice(0,10),count:[2,4,3,9,12,8,5,3,6,14,11,7,4,5,8,16,13,9,6,4,7,10,15,12,8,5,6,9,11,7][i]})),devices:[{label:'Mobile',count:181},{label:'Desktop',count:84},{label:'Tablet',count:13}],referrers:[{label:'l.facebook.com',count:96},{label:'linkedin.com',count:72},{label:'Direct or unknown',count:61},{label:'wa.me',count:49}],links:[{id:'1',campaign:'festive-offer',source:'linkedin',medium:'social',code:'a1',clicks:182,unique:131,last_click:'2026-11-08T10:00:00Z'},{id:'2',campaign:'spring-newsletter',source:'email',medium:'email',code:'b2',clicks:96,unique:80,last_click:'2026-11-05T08:00:00Z'}]};
export default function TrackingResults({workspace,demo=false}:{workspace:string;demo?:boolean}){
 const [days,setDays]=useState(30),[data,setData]=useState<Summary|null>(demo?sample:null),[error,setError]=useState(''),[loading,setLoading]=useState(!demo);
 useEffect(()=>{
  if(demo)return;
  let live=true;setLoading(true);setError('');
  fetch('/api/tracking/summary?workspace='+workspace+'&days='+days,{cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error||'Results could not load');if(live)setData(b);}).catch(e=>live&&setError(e.message)).finally(()=>live&&setLoading(false));
  return()=>{live=false;};
 },[workspace,days,demo]);
 const max=Math.max(1,...(data?.by_day.map(d=>d.count)||[1])),total=data?.devices.reduce((a,b)=>a+b.count,0)||0;
 return <section className="panel nxt-results" aria-label="Link results">
  <div className="panel-head"><div><span className="eyebrow">RESULTS</span><h3>How your links are performing</h3><p>Real visitors only. Link previews from WhatsApp, Facebook and similar apps are left out.</p></div>
   <div className="nxt-range" role="group" aria-label="Date range">{[7,30,90].map(d=><button key={d} type="button" className={days===d?'on':''} aria-pressed={days===d} onClick={()=>setDays(d)}>{d} days</button>)}</div></div>
  {demo&&<p className="notice">Sample results shown.</p>}
  {error&&<p className="notice error">{error}</p>}
  {!demo&&loading&&!data&&<p className="empty compact">Loading results…</p>}
  {data&&<>
   <div className="nxt-result-tiles"><div><span>Clicks</span><strong>{data.clicks}</strong></div><div><span>Unique visitors</span><strong>{data.unique}</strong></div><div><span>Link previews ignored</span><strong>{data.bots_filtered}</strong></div></div>
   {data.clicks===0?<p className="empty compact">No visitor clicks in the last {days} days. Share a tracked link or QR code to start collecting results.</p>:<>
    <div className="nxt-bars" role="img" aria-label={'Clicks per day for the last '+days+' days'}>{data.by_day.map(d=><span key={d.date} title={d.date+': '+d.count+' click'+(d.count===1?'':'s')} style={{height:Math.max(d.count?6:2,Math.round(d.count/max*100))+'%'}} className={d.count?'':'zero'}/>)}</div>
    <div className="nxt-bars-axis"><small>{data.by_day[0]?.date}</small><small>{data.by_day.at(-1)?.date}</small></div>
    <div className="nxt-split">
     <div><h4>Devices</h4>{data.devices.map(d=><p key={d.label} className="nxt-meter"><span>{d.label}</span><i><b style={{width:Math.round(d.count/Math.max(1,total)*100)+'%'}}/></i><em>{d.count}</em></p>)}</div>
     <div><h4>Where visitors came from</h4>{data.referrers.map(d=><p key={d.label} className="nxt-meter"><span>{d.label}</span><i><b style={{width:Math.round(d.count/Math.max(1,data.clicks)*100)+'%'}}/></i><em>{d.count}</em></p>)}</div>
    </div>
    <div className="table-wrap"><table><thead><tr><th>Campaign</th><th>Source and medium</th><th>Clicks</th><th>Unique</th><th>Last click</th></tr></thead><tbody>{data.links.slice(0,12).map(l=><tr key={l.id}><td>{l.campaign}</td><td>{l.source} · {l.medium}</td><td>{l.clicks}</td><td>{l.unique}</td><td>{l.last_click?new Date(l.last_click).toLocaleDateString():'None yet'}</td></tr>)}</tbody></table></div>
   </>}
  </>}
 </section>;
}
