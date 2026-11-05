'use client';
import {useEffect,useMemo,useState} from 'react';
import {Copy,Download,Link2,QrCode,RefreshCw} from 'lucide-react';

type Props={workspace:string;clients:{id:string;title:string}[]};
type Saved={
 id:string;business_name:string;business_code:string;destination_url:string;campaign:string;channel:string;placement:string;
 utm_source:string;utm_medium:string;utm_content:string;utm_term:string;final_url:string;qr_requested:boolean;client_id:string|null;created_at:string;
};
const channels=[
 ['facebook-post','Facebook post'],['facebook-reel','Facebook reel'],['instagram-post','Instagram post'],['instagram-reel','Instagram reel'],
 ['instagram-story','Instagram story'],['linkedin-post','LinkedIn post'],['linkedin-article','LinkedIn article'],['twitter-post','X / Twitter post'],
 ['tiktok-video','TikTok video'],['youtube-description','YouTube description'],['whatsapp-status','WhatsApp status'],['whatsapp-group','WhatsApp group'],
 ['whatsapp-broadcast','WhatsApp broadcast'],['whatsapp-channel','WhatsApp channel'],['whatsapp-chat','WhatsApp chat'],
 ['newsletter','Newsletter'],['sales-outreach','Cold / sales outreach'],['email-signature','Email signature'],['sms','SMS'],
 ['flyer','Flyer'],['poster','Poster'],['banner','Banner'],['business-card','Business card'],['brochure','Brochure'],['vehicle','Vehicle'],
 ['billboard','Billboard'],['packaging','Packaging'],['receipt','Receipt'],['event-stand','Event stand'],['tv-advert','TV advert'],
 ['google-business-profile','Google Business Profile'],['linkedin-ad','LinkedIn ad'],['tiktok-ad','TikTok ad'],['twitter-ad','X / Twitter ad'],['radio','Radio mention'],['podcast','Podcast mention'],['partner-referral','Partner / directory referral'],['influencer-affiliate','Influencer / affiliate']
] as const;
const offline=new Set(['flyer','poster','banner','business-card','brochure','vehicle','billboard','packaging','receipt','event-stand','tv-advert']);
const channelLabel=(v:string)=>channels.find(x=>x[0]===v)?.[1]??v;
function copy(value:string){return navigator.clipboard.writeText(value);}
function downloadQr(url:string,name:string){const a=document.createElement('a');a.href=url;a.download=name;a.target='_blank';a.rel='noreferrer';a.click();}
function exportCsv(links:Saved[]){const rows=[['date','business','campaign','channel','placement','destination_url','utm_source','utm_medium','utm_campaign','utm_content','utm_term','final_url','qr_file','post_id','created_by','notes'],...links.map(x=>[x.created_at,x.business_name,x.campaign,x.channel,x.placement,x.destination_url,x.utm_source,x.utm_medium,x.campaign,x.utm_content,x.utm_term,x.final_url,x.qr_requested?'generated-in-crm':'','','',''])];const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='nxt-crm-link-log.csv';a.click();URL.revokeObjectURL(a.href);}

export default function CrmLinkBuilder({workspace,clients}:Props){
 const now=new Date(),month=now.toISOString().slice(0,7);
 const [links,setLinks]=useState<Saved[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [form,setForm]=useState({business_name:'NXT Workforce',business_code:'nxw',client_id:'',destination_url:'https://www.nxt-workforce.com/',campaign_name:'',start_month:month,channel:'linkedin-post',placement:'',creative:'',utm_term:'',notes:''});
 const [result,setResult]=useState<any>(null);
 async function load(){const r=await fetch('/api/link-builder?workspace='+workspace,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setLinks(b.links??[]);}
 useEffect(()=>{load().catch(e=>setError(e.message));},[workspace]);
 const clientName=(id:string|null)=>clients.find(c=>c.id===id)?.title??'NXT Workforce';
 const qrNeeded=offline.has(form.channel);
 const existingCampaigns=useMemo(()=>[...new Set(links.map(x=>x.campaign))].sort(),[links]);

 function chooseClient(id:string){
  const cl=clients.find(c=>c.id===id);
  setForm(v=>({...v,client_id:id,business_name:cl?.title||'NXT Workforce',business_code:id?cl?.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,12)||'client':'nxw'}));
 }
 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');setNotice('');setResult(null);
  try{
   const r=await fetch('/api/link-builder?workspace='+workspace,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,client_id:form.client_id||null})}),b=await r.json();
   if(!r.ok)throw Error(b.error);setResult(b);setNotice('Tracking link saved.');await load();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="crm-link-builder">
  <section className="crm-link-hero"><div><span className="eyebrow">LINK BUILDER</span><h2>UTM tracking links & QR codes</h2><p>Build consistent GA4 campaign links, save them to the CRM log and generate QR codes for offline placements.</p></div><span>{links.length} saved links</span></section>
  {error&&<p className="notice error">{error}</p>}{notice&&<p className="notice">{notice}</p>}
  <div className="crm-link-layout">
   <form className="panel crm-link-form" onSubmit={submit}>
    <div className="panel-head"><div><h3>Create tracking link</h3><p>Values are normalised to lowercase and hyphens before saving.</p></div></div>
    <div className="form-grid">
     <label>Business<select value={form.client_id} onChange={e=>chooseClient(e.target.value)}><option value="">NXT Workforce</option>{clients.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
     <label>Short code<input value={form.business_code} maxLength={20} onChange={e=>setForm({...form,business_code:e.target.value})} placeholder="nxw"/></label>
    </div>
    <label>Destination page<input type="url" required value={form.destination_url} onChange={e=>setForm({...form,destination_url:e.target.value})} placeholder="https://www.nxt-workforce.com/services"/></label>
    <div className="form-grid">
     <label>Campaign name<input required value={form.campaign_name} onChange={e=>setForm({...form,campaign_name:e.target.value})} placeholder="festive offer"/></label>
     <label>Start month<input type="month" value={form.start_month} onChange={e=>setForm({...form,start_month:e.target.value})}/></label>
     <label>Channel / placement<select value={form.channel} onChange={e=>setForm({...form,channel:e.target.value})}>{channels.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
     <label>Placement / location<input value={form.placement} onChange={e=>setForm({...form,placement:e.target.value})} placeholder={qrNeeded?'harare-cbd / a5':'status / feed / story'}/></label>
     <label>Creative variant<input value={form.creative} onChange={e=>setForm({...form,creative:e.target.value})} placeholder="video-a / flyer-a5"/></label>
     <label>Paid keyword / audience<input value={form.utm_term} onChange={e=>setForm({...form,utm_term:e.target.value})} placeholder="Leave blank unless paid"/></label>
    </div>
    <label>Notes<textarea rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
    {existingCampaigns.length>0&&<label>Existing campaign values<select onChange={e=>e.target.value&&setForm({...form,campaign_name:e.target.value,start_month:''})} defaultValue=""><option value="">Reuse an existing campaign value</option>{existingCampaigns.map(x=><option key={x}>{x}</option>)}</select></label>}
    <button className="primary" disabled={busy}><Link2 size={15}/>{busy?'Building…':'Build & save link'}</button>
   </form>
   <section className="panel crm-link-result">
    <span className="eyebrow">RESULT</span><h3>Final tracked URL</h3>
    {result?<><textarea readOnly rows={5} value={result.final_url}/><div className="action-row"><button onClick={()=>copy(result.final_url).then(()=>setNotice('Link copied.'))}><Copy size={14}/>Copy link</button><a href={result.final_url} target="_blank" rel="noreferrer">Test destination</a></div>{result.qr_requested&&<section className="crm-qr-result"><QrCode size={26}/><div><strong>QR code ready</strong><small>Black on white · error correction M · 4-module margin</small></div><div className="action-row"><button onClick={()=>downloadQr(result.qr_png,form.business_code+'_'+result.campaign+'_'+result.utm_source+'_'+(result.utm_content||'qr')+'.png')}><Download size={14}/>PNG</button><button onClick={()=>downloadQr(result.qr_svg,form.business_code+'_'+result.campaign+'_'+result.utm_source+'_'+(result.utm_content||'qr')+'.svg')}><Download size={14}/>SVG</button></div></section>}</>:<div className="utm-empty"><QrCode size={30}/><p>Build a link to see the final URL and QR download options.</p></div>}
    <p className="panel-note">GA4 may show <strong>qr</strong> visits as Unassigned until a “QR and print” custom channel group is added.</p>
   </section>
  </div>
  <section className="panel crm-link-log"><div className="panel-head"><div><h3>Campaign link log</h3><p>Reuse exact campaign values and spot near-duplicates before publishing.</p></div><div className="action-row"><button onClick={()=>exportCsv(links)}><Download size={14}/>CSV log</button><button onClick={()=>load().catch(e=>setError(e.message))}><RefreshCw size={14}/>Refresh</button></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Business</th><th>Campaign</th><th>Channel</th><th>Source</th><th>Medium</th><th>Content</th><th>Final link</th></tr></thead><tbody>{links.map(x=><tr key={x.id}><td>{new Date(x.created_at).toLocaleDateString()}</td><td>{clientName(x.client_id)}</td><td><strong>{x.campaign}</strong></td><td>{channelLabel(x.channel)}</td><td>{x.utm_source}</td><td>{x.utm_medium}</td><td>{x.utm_content||'—'}</td><td><button onClick={()=>copy(x.final_url).then(()=>setNotice('Link copied.'))}>Copy</button></td></tr>)}{!links.length&&<tr><td colSpan={8}>No campaign links saved yet.</td></tr>}</tbody></table></div></section>
 </section>;
}
