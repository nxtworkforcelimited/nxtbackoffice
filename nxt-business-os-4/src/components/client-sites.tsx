'use client';
import {useEffect,useState} from 'react';
import type {Workspace} from '@/lib/types';
import {type ClientBuild,integrationStatuses} from '@/lib/client-sites';
import {ExternalLink,Globe,Server,Plug,Plus} from 'lucide-react';

const sampleSite:ClientBuild={id:'s1',title:'Kavi.R website',types:['Website'],stage:'Being built',progress:60,website_url:'',preview_url:'https://example.com',backoffice_url:'',target_date:'2026-12-01',hosting_managed:true,dns_managed:true,client_review:'Awaiting review',integrations:[{name:'Contact form to email',status:'connected',note:'Enquiries go to hello@kavi.example'},{name:'Google Analytics',status:'planned',note:''}]};
const sampleBack:ClientBuild={id:'s2',title:'Kavi.R back office',types:['Back Office'],stage:'Live',progress:100,website_url:'',preview_url:'',backoffice_url:'https://example.com',target_date:null,hosting_managed:true,dns_managed:false,client_review:'Approved',integrations:[{name:'SMS gateway',status:'connected',note:'Invoice and receipt texts'},{name:'Paynow payments',status:'attention',note:'Waiting for your merchant key'}]};

const dateText=(d:string|null)=>d?new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}):'';

export default function ClientSites({workspace,kind,demo=false,onTicket}:{workspace:Workspace;kind:'site'|'backoffice';demo?:boolean;onTicket?:()=>void}){
 const [builds,setBuilds]=useState<ClientBuild[]|null>(demo?[kind==='site'?sampleSite:sampleBack]:null),[error,setError]=useState('');
 useEffect(()=>{
  if(demo)return;let live=true;
  fetch('/api/client-builds?workspace='+workspace.id,{cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error||'Could not load.');if(live)setBuilds(b.builds);}).catch(e=>{if(live)setError(e.message);});
  return()=>{live=false;};
 },[workspace.id,demo]);
 const want=kind==='site'?'Website':'Back Office',list=(builds??[]).filter(b=>b.types.includes(want));
 if(error)return <p className="notice error" role="alert">{error}</p>;
 if(!builds)return <p role="status">Loading…</p>;
 return <section className="people-area client-sites">
  {demo&&<p className="notice">Preview only. Clients see their own {kind==='site'?'website':'back office'} here.</p>}
  {!list.length&&<div className="panel client-sites-empty"><h3>{kind==='site'?'Your website':'Your back office'}</h3><p>We are getting this ready. As soon as it is set up, you will see it here with a button to open it.</p>{onTicket&&<button className="secondary" onClick={onTicket}>Contact NXT</button>}</div>}
  {list.map(b=>{
   const link=kind==='site'?b.website_url||b.preview_url:b.backoffice_url||b.website_url;
   return <article key={b.id} className="panel client-site-card">
    <header><div><span className="eyebrow">{kind==='site'?'YOUR WEBSITE':'YOUR BACK OFFICE'}</span><h2>{b.title}</h2></div><span className={'client-stage '+b.stage.toLowerCase().replaceAll(' ','-')}>{b.stage}</span></header>
    <div className="client-site-progress" role="progressbar" aria-valuenow={b.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Launch progress"><i style={{width:b.progress+'%'}}/></div>
    <p className="client-site-meta"><strong>{b.progress}%</strong> of our launch checks are done{b.target_date?' · Target date '+dateText(b.target_date):''}</p>
    <div className="client-site-actions">
     {link?<a className="primary" href={link} target="_blank" rel="noopener noreferrer">{kind==='site'?<Globe size={16}/>:<Server size={16}/>}{kind==='site'?(b.website_url?'Open your website':'See the preview'):'Open your back office'}<ExternalLink size={14}/></a>:<span className="client-site-note">{kind==='site'?'Your website link will appear here when it is ready.':'Your back office link will appear here when it is ready.'}</span>}
     {kind==='site'&&b.website_url&&b.preview_url&&<a className="secondary" href={b.preview_url} target="_blank" rel="noopener noreferrer">See the preview<ExternalLink size={14}/></a>}
     {onTicket&&<button className="secondary" onClick={onTicket}><Plus size={14}/>Ask for a change</button>}
    </div>
    <ul className="client-site-facts">
     {b.client_review&&b.client_review!=='Not sent'&&<li><span>Your review</span><strong>{b.client_review}</strong></li>}
     {b.hosting_managed&&<li><span>Hosting</span><strong>Managed by NXT Workforce</strong></li>}
     {b.dns_managed&&<li><span>Domain and DNS</span><strong>Managed by NXT Workforce</strong></li>}
    </ul>
    <section className="client-integrations"><h3><Plug size={16}/>Connected systems</h3>
     {b.integrations.length?<ul>{b.integrations.map((it,i)=><li key={i}><div><strong>{it.name}</strong>{it.note&&<small>{it.note}</small>}</div><span className={'integration-pill '+it.status}>{integrationStatuses.find(s=>s.value===it.status)?.label}</span></li>)}</ul>:<p className="empty compact">No integrations are connected yet.</p>}
    </section>
   </article>;
  })}
 </section>;
}
