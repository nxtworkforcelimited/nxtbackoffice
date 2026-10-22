import type {TrackerKind, TrackerRecord, TrackerSnapshot} from '../master-tracker';
type TrackerContext = {user:{id:string};workspace?:{id:string;role:string}}|null;
type Config={workspaceId?:string;sitesToken?:string;feedSecret?:string};
const feedUrl='https://nxt-managing-director-master-tracker.hello153826.chatgpt.site/api/business-os-feed';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
const text=(v:unknown,max=12000)=>typeof v==='string'?v.slice(0,max):'';
const list=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string').slice(0,500):[];
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
function record(value:unknown):TrackerRecord{
 if(!value||typeof value!=='object')throw Error('Invalid record');
 const v=value as Record<string,unknown>;
 const id=text(v.id,200);if(!id)throw Error('Missing record identifier');
 return {id,title:text(v.title||v.name||v.risk||id,500),description:text(v.description),owner:text(v.owner||v.approver,300),support:list(v.support),status:text(v.status,100)||'Not set',priority:text(v.priority,100),due:date(v.due||v.target),clientDue:date(v.clientDue),notes:text(v.notes),action:text(v.action||v.mitigation),evidence:text(v.evidence),updatedAt:typeof v.updatedAt==='string'?text(v.updatedAt,100):null,checks:Array.isArray(v.checks)?v.checks.slice(0,500).map(x=>({text:text(x?.text,2000),done:x?.done===true})):[],dependencies:list(v.dependencies),approvalIds:list(v.approvalIds)};
}
export function normalizeSnapshot(value:unknown):TrackerSnapshot{
 if(!value||typeof value!=='object')throw Error('Invalid feed');
 const v=value as Record<string,unknown>;
 if(v.version!==1||typeof v.checkedAt!=='string'||!Number.isFinite(Date.parse(v.checkedAt))||!Array.isArray(v.projects)||v.projects.length!==3)throw Error('Invalid feed');
 const expected=new Map([['packeasy','Pack Easy'],['kavir','Kavi.R'],['cyber','Digital Safety Nest']]);
 const projects=v.projects.map(p=>{
  if(!p||typeof p!=='object'||!expected.has(p.id)||typeof p.available!=='boolean')throw Error('Invalid project');
  const name=expected.get(p.id)!;expected.delete(p.id);
  if(!p.available)return {id:p.id as string,name,available:false,checkedAt:null,error:'This tracker could not be refreshed. Its records are excluded.'};
  const data={} as Record<TrackerKind,TrackerRecord[]>;
  for(const kind of ['tasks','approvals','risks'] as const){if(!Array.isArray(p.data?.[kind])||p.data[kind].length>10000)throw Error('Invalid records');data[kind]=p.data[kind].map(record);if(new Set(data[kind].map(r=>r.id)).size!==data[kind].length)throw Error('Duplicate identifiers');}
  return {id:p.id as string,name,available:true,checkedAt:typeof p.checkedAt==='string'?p.checkedAt:v.checkedAt as string,data};
 });
 return {version:1,checkedAt:v.checkedAt,complete:projects.every(p=>p.available),projects};
}
export async function masterTrackerResponse(workspace:string|null,getContext:(workspace:string)=>Promise<TrackerContext>,config:Config={},fetcher:typeof fetch=fetch){
 if(!workspace)return Response.json({error:'Choose a workspace.'},{status:400,headers});
 let ctx:TrackerContext;
 try{ctx=await getContext(workspace);}catch{return Response.json({error:'Access could not be verified. Please retry.'},{status:503,headers});}
 if(!ctx?.user)return Response.json({error:'Sign in to continue.'},{status:401,headers});
 if(!ctx.workspace||ctx.workspace.id!==workspace||!['owner','admin','staff'].includes(ctx.workspace.role))return Response.json({error:'Internal staff access required.'},{status:403,headers});
 if(!config.workspaceId||workspace!==config.workspaceId)return Response.json({error:'Master Tracker is not enabled for this workspace.'},{status:403,headers});
 if(!config.sitesToken||!config.feedSecret)return Response.json({error:'The live tracker connection is not configured.'},{status:503,headers});
 try{
  const response=await fetcher(feedUrl,{headers:{'OAI-Sites-Authorization':'Bearer '+config.sitesToken,'X-Business-OS-Feed-Secret':config.feedSecret,'X-Business-OS-Workspace':workspace},cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error('Feed unavailable');
  const body=await response.text();if(body.length>8_000_000)throw Error('Feed too large');
  return Response.json(normalizeSnapshot(JSON.parse(body)),{headers});
 }catch{return Response.json({error:'Live tracker could not refresh. Please try again.'},{status:502,headers});}
}
