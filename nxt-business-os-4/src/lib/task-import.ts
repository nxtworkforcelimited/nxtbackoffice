export type ProposedTask={title:string;description:string;client_due:string;internal_due:string;scheduled_start:string;assignee_id:string;project_id:string;client_id:string;dependency_index:string;source_excerpt:string;warnings:string[]};
const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function valid(y:number,m:number,d:number){const date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?date.toISOString().slice(0,10):'';}
export function extractDate(text:string,reference:string):{date:string;warning:string}{
 let m=text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);if(m)return {date:valid(+m[1],+m[2],+m[3]),warning:''};
 m=text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);if(m)return {date:valid(+m[3],+m[2],+m[1]),warning:'Numeric date interpreted as day/month/year. Confirm.'};
 m=text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)(?:[,\s]+(20\d{2}))?\b/i);
 if(m)return {date:valid(m[3]?+m[3]:+reference.slice(0,4),months.indexOf(m[2].slice(0,3).toLowerCase())+1,+m[1]),warning:m[3]?'':'Year taken from reference date. Confirm.'};
 const ref=new Date(reference+'T12:00:00Z');
 if(!Number.isFinite(ref.getTime()))return {date:'',warning:'Choose a reference date.'};
 if(/\btomorrow\b/i.test(text)){ref.setUTCDate(ref.getUTCDate()+1);return {date:ref.toISOString().slice(0,10),warning:'Tomorrow resolved using the selected reference date.'};}
 if(/\btoday\b/i.test(text))return {date:reference,warning:'Today resolved using the selected reference date.'};
 m=text.match(/\b(next\s+|this\s+)?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
 if(m){const day=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(m[2].toLowerCase());let delta=(day-ref.getUTCDay()+7)%7;if(m[1]?.trim().toLowerCase()==='next')delta=delta===0?7:delta;ref.setUTCDate(ref.getUTCDate()+delta);return {date:ref.toISOString().slice(0,10),warning:'Weekday resolved to the next matching date. Confirm the intended week.'};}
 return {date:'',warning:'No supported deadline found. Enter a date before importing.'};
}
export function parseCSV(text:string):string[][]{const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('CSV contains an unclosed quoted field.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export function proposeTasks(text:string,reference:string,staff:{user_id:string;name:string;email:string}[]=[]):ProposedTask[]{
 if(text.length>150000)throw Error('Use at most 150,000 characters per import. Split larger documents.');
 const csv=/^(?:[^\n]*,)/.test(text)?parseCSV(text):[],heads=(csv[0]??[]).map(x=>x.trim().toLowerCase().replaceAll(' ','_'));const titleIndex=heads.findIndex(x=>['title','task','task_name','task_title','action'].includes(x));
 let records:Record<string,string>[];
 if(titleIndex>=0&&heads.length>1){records=csv.slice(1).map(row=>Object.fromEntries(heads.map((h,i)=>[h,row[i]??''])));}
 else {records=text.split(/\r?\n|(?<=[.!?])\s+(?=[A-Z])/).map(s=>s.trim()).filter(s=>s.length>=8&&!/^(from:|to:|subject:|date:|sent:|content-type:|mime-version:|--|best regards|kind regards|thank you)/i.test(s)).map(s=>({title:s.replace(/^[-*•\d.)\s]+/,'').replace(/^\[.*?\]\s*[^:]+:\s*/,''),source_excerpt:s}));}
 if(records.length>100)throw Error('More than 100 candidate lines found. Split the upload or use a CSV with one task per row.');
 return records.map(r=>{const source=r.source_excerpt||Object.entries(r).map(([k,v])=>k+': '+v).join(' | ');const title=r.title||r.task||r.task_name||r.task_title||r.action||'';const deadline=extractDate(r.client_due||r.client_deadline||r.due_date||r.deadline||source,reference);const internal=r.internal_due||r.internal_deadline||'';const candidates=staff.filter(s=>source.toLowerCase().includes(s.email.toLowerCase())||(s.name.length>3&&new RegExp('\\b'+s.name.split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(source)));return {title:title.slice(0,160),description:(r.description||r.description_/_acceptance_notes||source).slice(0,5000),source_excerpt:source.slice(0,10000),client_due:deadline.date,internal_due:internal?extractDate(internal,reference).date:'',scheduled_start:r.scheduled_start||'',client_id:'',project_id:'',assignee_id:candidates.length===1?candidates[0].user_id:'',dependency_index:r.dependency_index||'',warnings:[deadline.warning,...(candidates.length>1?['Several staff names found; choose the assignee.']:candidates.length===0?['Choose an assignee.']:[]),...(title.length>160?['Title shortened; full source is preserved.']:[])].filter(Boolean)};});
}
export function businessDaysBefore(iso:string,days:number){const d=new Date(iso+'T12:00:00Z');if(!Number.isFinite(d.getTime()))return '';let left=days;while(left>0){d.setUTCDate(d.getUTCDate()-1);if(d.getUTCDay()!==0&&d.getUTCDay()!==6)left--;}return d.toISOString().slice(0,10);}
