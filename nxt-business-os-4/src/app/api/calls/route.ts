import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {z} from 'zod';
import {extractImportFile} from '@/lib/server/import-file';
export const dynamic='force-dynamic';
const id=z.uuid();
const outcomes=['no_answer','voicemail','connected','callback','interested','not_interested','wrong_number','converted'] as const;
const statuses=['new','attempted','connected','callback','interested','not_interested','wrong_number','converted'] as const;
const reply=(b:any,s=200)=>NextResponse.json(b,{status:s,headers:{'Cache-Control':'private, no-store'}});
function parseCsv(text:string){
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"')quoted=true;else if(ch===','){row.push(cell);cell='';}else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=ch;}
 if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}return rows.filter(r=>r.some(x=>x.trim()));
}
function normalizeHeader(s:string){return s.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
function importRows(text:string,defaults:{target_type:'nxt'|'client';client_id:string|null;campaign:string;owner_id:string}){
 const rows=parseCsv(text);if(rows.length<2)throw Error('The sheet needs a header row and at least one prospect.');
 const headers=rows[0].map(normalizeHeader),find=(...names:string[])=>names.map(n=>headers.indexOf(n)).find(i=>i>=0)??-1;
 const ix={company:find('company','business','organisation','organization'),contact:find('contact_name','contact','name','person'),phone:find('phone','phone_number','mobile','telephone','tel'),email:find('email','email_address'),source:find('source','lead_source'),notes:find('notes','note','comments','comment')};
 if(ix.company<0||ix.phone<0)throw Error('Required columns: Company and Phone. Optional: Contact Name, Email, Source, Notes.');
 const clean=(v?:string)=>String(v??'').trim();
 const out=rows.slice(1).map((r,n)=>({tenant_id:'',target_type:defaults.target_type,client_id:defaults.target_type==='client'?defaults.client_id:null,campaign:defaults.campaign,company:clean(r[ix.company]),contact_name:ix.contact>=0?clean(r[ix.contact]):'',phone:clean(r[ix.phone]),email:ix.email>=0?clean(r[ix.email]):'',source:ix.source>=0?clean(r[ix.source]):'',notes:ix.notes>=0?clean(r[ix.notes]):'',owner_id:defaults.owner_id,status:'new',_row:n+2})).filter(x=>x.company||x.phone);
 if(out.length>1000)throw Error('Import at most 1,000 prospects at a time.');
 const invalid=out.find(x=>!x.company||x.phone.length<6||x.email&&!(z.email().safeParse(x.email).success));if(invalid)throw Error('Check row '+invalid._row+': Company and Phone are required, and Email must be valid.');
 return out.map(({_row,...x})=>x);
}
function googleSheetCsvUrl(value:string){
 const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='docs.google.com')throw Error('Use a Google Sheets link from docs.google.com.');
 const m=u.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);if(!m)throw Error('That is not a valid Google Sheets link.');
 const gid=u.searchParams.get('gid')||'0';return 'https://docs.google.com/spreadsheets/d/'+m[1]+'/export?format=csv&gid='+encodeURIComponent(gid);
}
export async function GET(req:NextRequest){
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client')return reply({error:'Staff access required'},403);
  const t=c.workspace.id,date=req.nextUrl.searchParams.get('date')||new Date().toISOString().slice(0,10),offset=Number(req.nextUrl.searchParams.get('offset')||0);
  const start=new Date(date+'T00:00:00.000Z');start.setUTCMinutes(start.getUTCMinutes()-offset);
  const end=new Date(start);end.setUTCDate(end.getUTCDate()+1);
  const [prospects,activities,clients,staff]=await Promise.all([
   c.db.from('cold_call_prospects').select('*').eq('tenant_id',t).order('updated_at',{ascending:false}).limit(1000),
   c.db.from('cold_call_activities').select('*').eq('tenant_id',t).gte('called_at',start.toISOString()).lt('called_at',end.toISOString()).order('called_at',{ascending:false}).limit(2000),
   c.db.from('clients').select('id,title').eq('tenant_id',t).is('archived_at',null).order('title'),
   c.db.from('staff_directory').select('user_id,name,email').eq('tenant_id',t).order('name')
  ]);
  for(const r of [prospects,activities,clients,staff])if(r.error)throw r.error;
  return reply({user_id:c.user.id,date,prospects:prospects.data,activities:activities.data,clients:clients.data,staff:staff.data});
 }catch(e){return reply({error:(e as Error).message||'Cold calling could not load'},500);}
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'Forbidden'},403);
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client')return reply({error:'Staff access required'},403);
  const t=c.workspace.id;
  if(req.headers.get('content-type')?.includes('multipart/form-data')){
   const f=await req.formData(),file=f.get('file'),target_type=String(f.get('target_type')||'nxt') as 'nxt'|'client',client_id=String(f.get('client_id')||'')||null,campaign=String(f.get('campaign')||'').trim(),owner_id=String(f.get('owner_id')||'')||c.user.id;
   if(!(file instanceof File))return reply({error:'Choose a CSV or XLSX file.'},400);if(!['nxt','client'].includes(target_type))return reply({error:'Invalid calling target.'},400);if(target_type==='client'&&!client_id)return reply({error:'Choose the client for this calling list.'},400);
   const text=await extractImportFile(file),rows=importRows(text,{target_type,client_id,campaign,owner_id}).map(x=>({...x,tenant_id:t}));
   const r=await c.db.from('cold_call_prospects').insert(rows).select('id');if(r.error)throw r.error;return reply({imported:r.data.length},201);
  }
  const b=await req.json(),action=String(b.action||'');
  if(action==='import_sheet'){
   const p=z.object({url:z.string().url(),target_type:z.enum(['nxt','client']),client_id:id.nullable().optional(),campaign:z.string().max(160).default(''),owner_id:id.nullable().optional()}).parse(b);if(p.target_type==='client'&&!p.client_id)return reply({error:'Choose the client for this calling list.'},400);
   const url=googleSheetCsvUrl(p.url),res=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(10000)});if(!res.ok)throw Error('Google Sheet could not be read. Make sure link sharing allows access.');const text=await res.text();if(text.length>300000)throw Error('Google Sheet is too large. Import at most 1,000 rows.');
   const rows=importRows(text,{target_type:p.target_type,client_id:p.client_id??null,campaign:p.campaign,owner_id:p.owner_id??c.user.id}).map(x=>({...x,tenant_id:t}));
   const r=await c.db.from('cold_call_prospects').insert(rows).select('id');if(r.error)throw r.error;return reply({imported:r.data.length},201);
  }
  if(action==='create_prospect'){
   const p=z.object({target_type:z.enum(['nxt','client']),client_id:id.nullable().optional(),campaign:z.string().max(160).default(''),company:z.string().trim().min(1).max(200),contact_name:z.string().max(160).default(''),phone:z.string().trim().min(6).max(40),email:z.union([z.email(),z.literal('')]).default(''),source:z.string().max(160).default(''),owner_id:id.nullable().optional(),notes:z.string().max(5000).default('')}).parse(b);
   if(p.target_type==='client'&&!p.client_id)return reply({error:'Choose the client this calling campaign belongs to.'},400);
   const r=await c.db.from('cold_call_prospects').insert({...p,tenant_id:t,client_id:p.target_type==='client'?p.client_id:null,owner_id:p.owner_id??c.user.id}).select().single();if(r.error)throw r.error;return reply(r.data,201);
  }
  if(action==='update_prospect'){
   const p=z.object({id,status:z.enum(statuses),notes:z.string().max(5000).default(''),feedback:z.string().max(5000).default(''),next_follow_up:z.string().datetime({offset:true}).nullable().optional(),owner_id:id.nullable().optional()}).parse(b);
   const r=await c.db.from('cold_call_prospects').update({status:p.status,notes:p.notes,feedback:p.feedback,next_follow_up:p.next_follow_up??null,owner_id:p.owner_id??null}).eq('tenant_id',t).eq('id',p.id).select().single();if(r.error)throw r.error;return reply(r.data);
  }
  if(action==='log_call'){
   const p=z.object({prospect_id:id,outcome:z.enum(outcomes),notes:z.string().max(5000).default(''),feedback:z.string().max(5000).default(''),duration_seconds:z.number().int().min(0).max(28800).nullable().optional(),next_follow_up:z.string().datetime({offset:true}).nullable().optional()}).parse(b);
   const prospect=await c.db.from('cold_call_prospects').select('id').eq('tenant_id',t).eq('id',p.prospect_id).single();if(prospect.error)return reply({error:'Prospect not found'},404);
   const act=await c.db.from('cold_call_activities').insert({tenant_id:t,prospect_id:p.prospect_id,caller_id:c.user.id,outcome:p.outcome,notes:p.notes,feedback:p.feedback,duration_seconds:p.duration_seconds??null}).select().single();if(act.error)throw act.error;
   const mapped=p.outcome==='no_answer'||p.outcome==='voicemail'?'attempted':p.outcome;
   const upd=await c.db.from('cold_call_prospects').update({status:mapped,last_called_at:new Date().toISOString(),last_outcome:p.outcome,feedback:p.feedback||undefined,next_follow_up:p.next_follow_up??null}).eq('tenant_id',t).eq('id',p.prospect_id).select().single();if(upd.error)throw upd.error;
   return reply({activity:act.data,prospect:upd.data},201);
  }
  return reply({error:'Unknown action'},400);
 }catch(e){return reply({error:e instanceof z.ZodError?e.issues.map(i=>i.message).join('; '):(e as Error).message||'Cold calling action failed'},400);}
}
