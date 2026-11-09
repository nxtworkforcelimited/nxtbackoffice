// What a client may see about the websites and back offices NXT builds for them. Pure functions, used by the API and the page.
export const integrationStatuses=[
 {value:'connected',label:'Connected'},
 {value:'planned',label:'Planned'},
 {value:'attention',label:'Needs attention'}
] as const;
export type IntegrationStatus=typeof integrationStatuses[number]['value'];
export type Integration={name:string;status:IntegrationStatus;note:string};

export function cleanIntegrations(value:unknown):Integration[]{
 if(!Array.isArray(value))return [];
 const ok=new Set<string>(integrationStatuses.map(s=>s.value)),out:Integration[]=[];
 for(const v of value){
  if(!v||typeof v!=='object')continue;
  const r=v as Record<string,unknown>,name=String(r.name??'').trim().slice(0,80);
  if(!name)continue;
  out.push({name,status:ok.has(String(r.status))?String(r.status) as IntegrationStatus:'planned',note:String(r.note??'').trim().slice(0,200)});
  if(out.length>=20)break;
 }
 return out;
}
export function safeLink(value:unknown){
 const s=String(value??'').trim();
 if(!/^https?:\/\//i.test(s))return '';
 try{const u=new URL(s);return u.protocol==='http:'||u.protocol==='https:'?u.toString():'';}catch{return '';}
}
/** Plain-English stage for a client. Internal test results are not shown. */
export function clientStage(status:unknown,hasSite:boolean){
 switch(String(status)){
  case 'Not started':return 'Planning';
  case 'In progress':return 'Being built';
  case 'Under review':case 'Testing mode':case 'Testing failed':return 'Final checks';
  case 'Testing passed':case 'Complete':return hasSite?'Live':'Ready';
  default:return 'Planning';
 }
}
export type ClientBuild={
 id:string;title:string;types:('Website'|'Back Office')[];stage:string;progress:number;
 website_url:string;preview_url:string;backoffice_url:string;target_date:string|null;
 hosting_managed:boolean;dns_managed:boolean;client_review:string;integrations:Integration[];
};
/** Turn a raw build row into the safe client shape. Only these fields ever leave the server. */
export function toClientBuild(row:Record<string,unknown>):ClientBuild{
 const types=(Array.isArray(row.build_types)?row.build_types:[]).filter((t):t is 'Website'|'Back Office'=>t==='Website'||t==='Back Office');
 const list=Array.isArray(row.checklist)?row.checklist as {done?:unknown}[]:[];
 const done=list.filter(i=>i&&i.done===true).length,progress=list.length?Math.round(done/list.length*100):0;
 const site=safeLink(row.url);
 return {
  id:String(row.id),title:String(row.title??''),types,
  stage:clientStage(row.status,Boolean(site)),progress,
  website_url:site,preview_url:safeLink(row.prototype_url),backoffice_url:safeLink(row.backoffice_url)||'',
  target_date:typeof row.target_date==='string'?row.target_date:null,
  hosting_managed:row.hosting_managed===true,dns_managed:row.dns_managed===true,
  client_review:String(row.client_review_status??''),
  integrations:cleanIntegrations(row.integrations)
 };
}
