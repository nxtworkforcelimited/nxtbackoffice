'use client';
import {useEffect,useState} from 'react';
type L={id:string;campaign:string;source:string;medium:string;code:string};
const general=[['','Not set'],['cold-calling','Cold calling'],['referral','Referral'],['website','Website enquiry'],['social','Social media (untracked)'],['event','Event or print']];
const sample:L[]=[{id:'1',campaign:'festive-offer',source:'linkedin',medium:'social',code:'a1'}];
export default function LeadSourceField({workspace,demo=false,defaultValue=''}:{workspace:string;demo?:boolean;defaultValue?:string}){
 const [links,setLinks]=useState<L[]>(demo?sample:[]);
 useEffect(()=>{if(demo)return;let live=true;fetch('/api/tracking/summary?workspace='+workspace+'&days=90',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(b=>{if(live&&b?.links)setLinks(b.links);}).catch(()=>{});return()=>{live=false;};},[workspace,demo]);
 return <label>Where did this lead come from?<select name="lead_source" defaultValue={defaultValue}>
  {general.map(([v,l])=><option key={v} value={v}>{l}</option>)}
  {links.length>0&&<optgroup label="Tracked links">{links.map(l=><option key={l.id} value={'link:'+l.code}>{l.campaign} ({l.source}, {l.medium})</option>)}</optgroup>}
 </select></label>;
}
