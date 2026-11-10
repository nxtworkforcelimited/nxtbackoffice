import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {z} from 'zod';
import {extractImportFile} from '@/lib/server/import-file';
import {normalisePhone} from '@/lib/phone';
import {isMicrosoftLink} from '@/lib/microsoft-links';
import {fetchMicrosoftFile} from '@/lib/server/microsoft-file';
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
function excelDate(value:string){
 const raw=value.trim();if(!raw)return null;
 if(/^\d+(?:\.\d+)?$/.test(raw)){const serial=Number(raw);if(serial>20000&&serial<100000){const d=new Date(Date.UTC(1899,11,30)+serial*86400000);return d.toISOString();}}
 const parsed=Date.parse(raw);return Number.isFinite(parsed)?new Date(parsed).toISOString():null;
}
function mappedStatus(value:string){
 const v=value.trim().toLowerCase();
 if(!v||v==='not contacted'||v==='needs research')return 'new';
 if(v==='attempted contact')return 'attempted';
 if(v==='contacted')return 'connected';
 if(v==='interested'||v==='proposal sent')return 'interested';
 if(v==='follow-up required'||v==='meeting scheduled'||v==='on hold')return 'callback';
 if(v==='registered')return 'converted';
 if(v==='not interested')return 'not_interested';
 return 'new';
}
function importRows(text:string,defaults:{target_type:'nxt'|'client';client_id:string|null;campaign:string;owner_id:string}){
 const rows=parseCsv(text);if(rows.length<2)throw Error('The sheet needs a header row and at least one prospect.');
 const headers=rows[0].map(normalizeHeader),find=(...names:string[])=>names.map(n=>headers.indexOf(n)).find(i=>i>=0)??-1;
 const ix={
  business_id:find('business_id','id','reference'),
  company:find('business_name','company','business','organisation','organization'),
  category:find('category','business_category'),
  location:find('location_address','location','address'),
  phone:find('contact_number','phone','phone_number','mobile','telephone','tel'),
  alt_phone:find('alternative_number','alternative_contact_number','alternate_number','alternate_contact_number','alt_phone','alt_number','other_number','secondary_number','secondary_phone'),
  website:find('website_source','website','source_url'),
  existing:find('existing_app_online_system','existing_app','online_system','existing_system'),
  contact:find('contact_person','contact_name','contact','name','person'),
  date_contacted:find('date_contacted','contacted_date'),
  contact_method:find('contact_method','method'),
  person_spoken_to:find('person_spoken_to','spoken_to'),
  interest:find('interest_level','interest'),
  outreach:find('outreach_status','status'),
  follow_up:find('next_follow_up_date','next_follow_up','follow_up_date'),
  registration:find('registration_status','registration'),
  notes:find('next_action_notes','next_action','notes','note','comments','comment'),
  integration:find('integration_needed','integration'),
  email:find('email','email_address')
 };
 if(ix.company<0||ix.phone<0)throw Error('Required columns: Business Name (or Company) and Contact Number (or Phone). Spotly-style outreach columns are supported automatically.');
 const clean=(v?:string)=>String(v??'').trim();
 const out=rows.slice(1).map((r,n)=>{
  const company=clean(r[ix.company]),phone=clean(r[ix.phone]),outreach=ix.outreach>=0?clean(r[ix.outreach]):'';
  return {
   tenant_id:'',target_type:defaults.target_type,client_id:defaults.target_type==='client'?defaults.client_id:null,campaign:defaults.campaign,
   business_id:ix.business_id>=0?clean(r[ix.business_id]):'',company,category:ix.category>=0?clean(r[ix.category]):'',
   location_address:ix.location>=0?clean(r[ix.location]):'',phone,alt_phone:ix.alt_phone>=0?clean(r[ix.alt_phone]).slice(0,80):'',website_source:ix.website>=0?clean(r[ix.website]):'',
   existing_system:ix.existing>=0?clean(r[ix.existing]):'',contact_name:ix.contact>=0?clean(r[ix.contact]):'',
   contact_method:ix.contact_method>=0?clean(r[ix.contact_method]):'',person_spoken_to:ix.person_spoken_to>=0?clean(r[ix.person_spoken_to]):'',
   interest_level:ix.interest>=0?clean(r[ix.interest]):'',registration_status:ix.registration>=0?clean(r[ix.registration]):'',
   next_action:ix.notes>=0?clean(r[ix.notes]):'',integration_needed:ix.integration>=0?clean(r[ix.integration]):'',
   email:ix.email>=0?clean(r[ix.email]):'',source:ix.website>=0?clean(r[ix.website]):'',
   notes:ix.notes>=0?clean(r[ix.notes]):'',owner_id:defaults.owner_id,status:mappedStatus(outreach),
   last_called_at:ix.date_contacted>=0?excelDate(clean(r[ix.date_contacted])):null,
   next_follow_up:ix.follow_up>=0?excelDate(clean(r[ix.follow_up])):null,
   follow_up_method:'Call',_row:n+2
  };
 }).filter(x=>x.company||x.phone);
 if(out.length>1000)throw Error('Import at most 1,000 prospects at a time.');
 const invalid=out.find(x=>!x.company||!x.phone||x.email&&!(z.email().safeParse(x.email).success));if(invalid)throw Error('Check row '+invalid._row+': Business Name and Contact Number are required, and Email must be valid when supplied.');
 return out.map(({_row,...x})=>x);
}
function googleSheetCsvUrl(value:string){
 const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='docs.google.com')throw Error('Use a Google Sheets link from docs.google.com.');
 const m=u.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);if(!m)throw Error('That is not a valid Google Sheets link.');
 const gid=u.searchParams.get('gid')||'0';return 'https://docs.google.com/spreadsheets/d/'+m[1]+'/export?format=csv&gid='+encodeURIComponent(gid);
}

// Duplicate check: the same number for the same caller target (NXT or one client) is skipped, never overwritten or deleted.
const targetKey=(x:{target_type:string;client_id:string|null})=>x.target_type==='client'?'client:'+(x.client_id||''):'nxt';
async function insertWithoutDuplicates(c:any,t:string,rows:any[]){
 const cleaned=rows.map(x=>{const n=normalisePhone(x.phone);return {...x,phone:n.e164??x.phone,_key:n.key?targetKey(x)+'|'+n.key:''};});
 const existing=new Set<string>();
 for(let from=0;from<20000;from+=1000){
  const r=await c.db.from('cold_call_prospects').select('phone,target_type,client_id').eq('tenant_id',t).is('archived_at',null).range(from,from+999);if(r.error)throw r.error;
  for(const e of r.data){const k=normalisePhone(e.phone).key;if(k)existing.add(targetKey(e)+'|'+k);}
  if(r.data.length<1000)break;
 }
 const seen=new Set<string>(),fresh:any[]=[];let duplicates=0,duplicatesInFile=0;
 for(const {_key,...row} of cleaned){
  if(_key&&existing.has(_key)){duplicates++;continue;}
  if(_key&&seen.has(_key)){duplicatesInFile++;continue;}
  if(_key)seen.add(_key);fresh.push(row);
 }
 if(!fresh.length)return {imported:0,duplicates,duplicates_in_file:duplicatesInFile};
 const r=await c.db.from('cold_call_prospects').insert(fresh).select('id');if(r.error)throw r.error;
 return {imported:r.data.length,duplicates,duplicates_in_file:duplicatesInFile};
}
// The database returns at most 1,000 rows per request, so lists are read in pages. Without this a long list would silently lose rows.
async function pageProspects(c:any,t:string){
 const all:any[]=[];
 for(let from=0;from<5000;from+=1000){
  const r=await c.db.from('cold_call_prospects').select('*').eq('tenant_id',t).is('archived_at',null).order('updated_at',{ascending:false}).order('id').range(from,from+999);
  if(r.error)return {data:null,error:r.error};
  all.push(...r.data);if(r.data.length<1000)break;
 }
 return {data:all,error:null};
}
export async function GET(req:NextRequest){
 try{
  const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client')return reply({error:'Staff access required'},403);
  const t=c.workspace.id,date=req.nextUrl.searchParams.get('date')||new Date().toISOString().slice(0,10),offset=Number(req.nextUrl.searchParams.get('offset')||0);
  const start=new Date(date+'T00:00:00.000Z');start.setUTCMinutes(start.getUTCMinutes()-offset);
  const end=new Date(start);end.setUTCDate(end.getUTCDate()+1);
  const [prospects,removed,activities,recentActivities,clients,staff]=await Promise.all([
   pageProspects(c,t),
   c.db.from('cold_call_prospects').select('id,business_id,company,category,phone,campaign,target_type,client_id,archived_at,archive_reason').eq('tenant_id',t).not('archived_at','is',null).order('archived_at',{ascending:false}).limit(1000),
   c.db.from('cold_call_activities').select('*').eq('tenant_id',t).gte('called_at',start.toISOString()).lt('called_at',end.toISOString()).order('called_at',{ascending:false}).limit(2000),
   c.db.from('cold_call_activities').select('*').eq('tenant_id',t).order('called_at',{ascending:false}).limit(5000),
   c.db.from('clients').select('id,title').eq('tenant_id',t).is('archived_at',null).order('title'),
   c.db.from('staff_directory').select('user_id,name,email').eq('tenant_id',t).order('name')
  ]);
  // Until the Business ID and remove migration has been run, the archive column does not exist. Show the old list instead of failing.
  const noArchive=/archived_at/.test(prospects.error?.message||'');
  if(noArchive){const all=await c.db.from('cold_call_prospects').select('*').eq('tenant_id',t).order('updated_at',{ascending:false}).limit(1000);if(all.error)throw all.error;prospects.data=all.data;prospects.error=null as any;removed.data=[];removed.error=null as any;}
  for(const r of [prospects,removed,activities,recentActivities,clients,staff])if(r.error)throw r.error;
  return reply({user_id:c.user.id,date,archive_ready:!noArchive,removed:removed.data,prospects:prospects.data,activities:activities.data,recent_activities:recentActivities.data,clients:clients.data,staff:staff.data});
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
   return reply(await insertWithoutDuplicates(c,t,rows),201);
  }
  const b=await req.json(),action=String(b.action||'');
  if(action==='import_sheet'){
   const p=z.object({url:z.string().url(),target_type:z.enum(['nxt','client']),client_id:id.nullable().optional(),campaign:z.string().max(160).default(''),owner_id:id.nullable().optional()}).parse(b);if(p.target_type==='client'&&!p.client_id)return reply({error:'Choose the client for this calling list.'},400);
   let text:string;
   if(isMicrosoftLink(p.url)){text=await extractImportFile(await fetchMicrosoftFile(p.url));}
   else{const url=googleSheetCsvUrl(p.url),res=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(10000)});if(!res.ok)throw Error('The sheet could not be read. Make sure link sharing allows access.');text=await res.text();if(text.length>300000)throw Error('The sheet is too large. Import at most 1,000 rows.');}
   const rows=importRows(text,{target_type:p.target_type,client_id:p.client_id??null,campaign:p.campaign,owner_id:p.owner_id??c.user.id}).map(x=>({...x,tenant_id:t}));
   return reply(await insertWithoutDuplicates(c,t,rows),201);
  }
  if(action==='create_prospect'){
   const p=z.object({target_type:z.enum(['nxt','client']),client_id:id.nullable().optional(),campaign:z.string().max(160).default(''),business_id:z.string().max(80).default(''),company:z.string().trim().min(1).max(200),category:z.string().max(160).default(''),location_address:z.string().max(500).default(''),contact_name:z.string().max(160).default(''),phone:z.string().trim().min(1).max(80),alt_phone:z.string().trim().max(80).default(''),email:z.union([z.email(),z.literal('')]).default(''),website_source:z.string().max(500).default(''),existing_system:z.string().max(300).default(''),contact_method:z.string().max(80).default(''),person_spoken_to:z.string().max(160).default(''),interest_level:z.string().max(80).default(''),registration_status:z.string().max(80).default(''),next_action:z.string().max(5000).default(''),integration_needed:z.string().max(80).default(''),follow_up_method:z.enum(['Call','Email','SMS','WhatsApp']).default('Call'),source:z.string().max(500).default(''),owner_id:id.nullable().optional(),notes:z.string().max(5000).default('')}).parse(b);
   if(p.target_type==='client'&&!p.client_id)return reply({error:'Choose the client this calling campaign belongs to.'},400);
   const n=normalisePhone(p.phone),cid=p.target_type==='client'?p.client_id??null:null;
   if(n.key){
    const scoped=await c.db.from('cold_call_prospects').select('id,company,phone,client_id').eq('tenant_id',t).eq('target_type',p.target_type).is('archived_at',null).limit(20000);if(scoped.error)throw scoped.error;
    const dup=scoped.data.find((e:any)=>normalisePhone(e.phone).key===n.key&&(e.client_id??null)===cid);
    if(dup&&!b.allow_duplicate)return reply({error:'Already on a calling list: '+dup.company+' ('+dup.phone+'). Open that record instead of adding it again.',duplicate_id:dup.id},409);
   }
   const r=await c.db.from('cold_call_prospects').insert({...p,phone:n.e164??p.phone,tenant_id:t,client_id:cid,owner_id:p.owner_id??c.user.id}).select().single();if(r.error)throw r.error;return reply(r.data,201);
  }
  if(action==='edit_cell'){
   // One cell edited in the sheet view. Only these columns can be changed this way; status cannot be set to converted here
   // (converting is done by logging a call, which also creates the CRM deal).
   const textFields=['business_id','category','location_address','website_source','existing_system','contact_name','contact_method','person_spoken_to','interest_level','registration_status','integration_needed','follow_up_method','next_action','email','alt_phone'] as const;
   const p=z.object({id,field:z.enum(['company','phone','status','owner_id',...textFields]),value:z.string().max(5000)}).parse(b);
   let value:any=p.value.trim();
   if(p.field==='company'){if(!value)return reply({error:'Business name cannot be empty.'},400);if(value.length>200)return reply({error:'Business name is too long.'},400);}
   else if(p.field==='phone'){const n=normalisePhone(value);if(!(n.e164??value))return reply({error:'Contact number cannot be empty.'},400);value=n.e164??value;}
   else if(p.field==='status'){if(!statuses.includes(value as any)||value==='converted')return reply({error:'Choose a status. To convert a prospect, log the call as Converted.'},400);}
   else if(p.field==='owner_id'){value=value||null;if(value&&!id.safeParse(value).success)return reply({error:'Choose a team member.'},400);}
   else if(p.field==='email'&&value&&!z.email().safeParse(value).success)return reply({error:'Enter a valid email address, or leave it blank.'},400);
   else if(p.field==='alt_phone'&&value.length>80)return reply({error:'The alternative number is too long.'},400);
   else if(value.length>500&&p.field!=='next_action')return reply({error:'That entry is too long.'},400);
   const upd:any={[p.field]:value};if(p.field==='next_action')upd.notes=value;
   const r=await c.db.from('cold_call_prospects').update(upd).eq('tenant_id',t).eq('id',p.id).select().single();if(r.error)throw r.error;return reply(r.data);
  }
  if(action==='mark_message_sent'){
   // Records that a sign-up message went to this business, on which channel and when. It does not send anything.
   const p=z.object({id,channel:z.enum(['whatsapp','sms','email'])}).parse(b);
   const r=await c.db.from('cold_call_prospects').update({message_sent_at:new Date().toISOString(),message_channel:p.channel}).eq('tenant_id',t).eq('id',p.id).is('archived_at',null).select().maybeSingle();
   if(r.error)throw r.error;if(!r.data)return reply({error:'That business was not found.'},404);return reply(r.data);
  }
  if(action==='archive_list'||action==='restore_list'){
   // A whole list (one client or NXT, one list name) is hidden or brought back in one step. Nothing is deleted.
   const p=z.object({target_type:z.enum(['nxt','client']),client_id:id.nullable().optional(),campaign:z.string().max(160).default('')}).parse(b);
   if(p.target_type==='client'&&!p.client_id)return reply({error:'Choose the client for this list.'},400);
   const archiving=action==='archive_list';
   let q=c.db.from('cold_call_prospects').update(archiving?{archived_at:new Date().toISOString(),archived_by:c.user.id,archive_reason:'List removed'}:{archived_at:null,archived_by:null,archive_reason:''}).eq('tenant_id',t).eq('target_type',p.target_type).eq('campaign',p.campaign);
   q=p.target_type==='client'?q.eq('client_id',p.client_id):q.is('client_id',null);
   q=archiving?q.is('archived_at',null):q.not('archived_at','is',null);
   const r=await q.select('id');if(r.error)throw r.error;return reply({count:r.data.length});
  }
  if(action==='archive_prospect'){
   // Removing hides a business from every list and queue. The record, its call history and its Business ID are kept and can be restored.
   const p=z.object({id,reason:z.string().trim().max(500).default('')}).parse(b);
   const r=await c.db.from('cold_call_prospects').update({archived_at:new Date().toISOString(),archived_by:c.user.id,archive_reason:p.reason}).eq('tenant_id',t).eq('id',p.id).is('archived_at',null).select('id,company').maybeSingle();
   if(r.error)throw r.error;if(!r.data)return reply({error:'That business is already removed or no longer exists.'},404);return reply({id:r.data.id,company:r.data.company});
  }
  if(action==='restore_prospect'){
   const p=z.object({id}).parse(b);
   const r=await c.db.from('cold_call_prospects').update({archived_at:null,archived_by:null,archive_reason:''}).eq('tenant_id',t).eq('id',p.id).not('archived_at','is',null).select().maybeSingle();
   if(r.error)throw r.error;if(!r.data)return reply({error:'That business is not in the removed list.'},404);return reply(r.data);
  }
  if(action==='update_prospect'){
   const p=z.object({id,status:z.enum(statuses),notes:z.string().max(5000).default(''),feedback:z.string().max(5000).default(''),next_follow_up:z.string().datetime({offset:true}).nullable().optional(),owner_id:id.nullable().optional()}).parse(b);
   const r=await c.db.from('cold_call_prospects').update({status:p.status,notes:p.notes,feedback:p.feedback,next_follow_up:p.next_follow_up??null,owner_id:p.owner_id??null}).eq('tenant_id',t).eq('id',p.id).select().single();if(r.error)throw r.error;return reply(r.data);
  }
  if(action==='log_call'){
   const p=z.object({prospect_id:id,caller_id:id.nullable().optional(),outcome:z.enum(outcomes),notes:z.string().max(5000).default(''),feedback:z.string().max(5000).default(''),duration_seconds:z.number().int().min(0).max(28800).nullable().optional(),next_follow_up:z.string().datetime({offset:true}).nullable().optional(),follow_up_method:z.enum(['Call','Email','SMS','WhatsApp']).default('Call')}).parse(b);
   const prospect=await c.db.from('cold_call_prospects').select('id,company,campaign,contact_name,phone,email,notes,feedback,target_type,client_id,converted_deal_id').eq('tenant_id',t).eq('id',p.prospect_id).single();if(prospect.error)return reply({error:'Prospect not found'},404);
   const act=await c.db.from('cold_call_activities').insert({tenant_id:t,prospect_id:p.prospect_id,caller_id:p.caller_id??c.user.id,outcome:p.outcome,notes:p.notes,feedback:p.feedback,duration_seconds:p.duration_seconds??null}).select().single();if(act.error)throw act.error;
   const mapped=p.outcome==='no_answer'||p.outcome==='voicemail'?'attempted':p.outcome;
   const upd=await c.db.from('cold_call_prospects').update({status:mapped,last_called_at:new Date().toISOString(),last_outcome:p.outcome,feedback:p.feedback||undefined,next_follow_up:p.next_follow_up??null,follow_up_method:p.follow_up_method}).eq('tenant_id',t).eq('id',p.prospect_id).select().single();if(upd.error)throw upd.error;
   // A converted prospect becomes one CRM deal, once. Existing deals and records are never changed.
   let deal:any=null,warning='';
   if(p.outcome==='converted'&&!prospect.data.converted_deal_id){
    const pr=prospect.data,title=(pr.company+(pr.campaign?' - '+pr.campaign:'')).slice(0,160);
    const description=['Converted from Cold Calling.',pr.contact_name&&'Contact: '+pr.contact_name,pr.phone&&'Phone: '+pr.phone,pr.email&&'Email: '+pr.email,(p.notes||pr.notes)&&'Notes: '+(p.notes||pr.notes)].filter(Boolean).join('\n').slice(0,5000);
    const base={tenant_id:t,title,description,status:'new',client_id:pr.target_type==='client'?pr.client_id:null,client_visible:false,amount:0};
    let d=await c.db.from('deals').insert({...base,lead_source:'cold-calling'}).select('id,title').single();
    if(d.error&&/lead_source/.test(d.error.message))d=await c.db.from('deals').insert(base).select('id,title').single();
    if(d.error)warning='The call was saved, but the CRM deal could not be created: '+d.error.message;
    else{deal=d.data;const link=await c.db.from('cold_call_prospects').update({converted_deal_id:d.data.id,converted_at:new Date().toISOString()}).eq('tenant_id',t).eq('id',p.prospect_id).select().single();if(!link.error)upd.data=link.data;}
   }
   return reply({activity:act.data,prospect:upd.data,deal,warning},201);
  }
  return reply({error:'Unknown action'},400);
 }catch(e){return reply({error:e instanceof z.ZodError?e.issues.map(i=>i.message).join('; '):(e as Error).message||'Cold calling action failed'},400);}
}
