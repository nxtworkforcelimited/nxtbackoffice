// Staff profile completeness, salary range checks, overtime totals and reminder wording. Pure functions.
export type StaffRecord={
 home_address?:string|null;emergency_contact?:string|null;emergency_phone?:string|null;
 medical_conditions?:string|null;medical_declared?:boolean|null;
};
export type StaffFile={category:string};
export const profileItems=[
 {key:'cv',label:'CV',how:'Upload your CV in My Profile.'},
 {key:'id',label:'ID copy',how:'Upload a copy of your National ID in My Profile.'},
 {key:'contract',label:'Signed contract',how:'Upload your signed contract in My Profile.'},
 {key:'address',label:'Home address',how:'Add your home address in My Profile.'},
 {key:'next_of_kin',label:'Next of kin',how:'Add a next of kin name and phone number in My Profile.'},
 {key:'photo',label:'Profile photo',how:'Upload a clear photo of yourself in My Profile.'},
 {key:'medical',label:'Medical conditions',how:'List any medical conditions, or tick that you have none, in My Profile.'}
] as const;
export type ProfileKey=typeof profileItems[number]['key'];
const has=(v:unknown)=>String(v??'').trim().length>0;
export function completeness(employee:StaffRecord,files:StaffFile[]){
 const cats=new Set(files.map(f=>f.category));
 const done:Record<ProfileKey,boolean>={
  cv:cats.has('CV'),id:cats.has('National ID'),contract:cats.has('Contract'),
  address:has(employee.home_address),
  next_of_kin:has(employee.emergency_contact)&&has(employee.emergency_phone),
  photo:cats.has('Profile Photo'),
  medical:has(employee.medical_conditions)||employee.medical_declared===true
 };
 const items=profileItems.map(i=>({key:i.key,label:i.label,how:i.how,done:done[i.key]}));
 const missing=items.filter(i=>!i.done);
 return {items,missing,percent:Math.round((items.length-missing.length)/items.length*100),complete:missing.length===0};
}
/** ISO week key such as 2026-W46. One reminder per person per week. */
export function weekKey(d:Date){
 const t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
 const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);
 const start=new Date(Date.UTC(t.getUTCFullYear(),0,1));
 return t.getUTCFullYear()+'-W'+String(Math.ceil(((t.getTime()-start.getTime())/86400000+1)/7)).padStart(2,'0');
}
export function dayKey(d:Date){return 'day-'+d.toISOString().slice(0,10);}
export function reminderEmail(name:string,missing:{label:string;how:string}[],appUrl:string,company='NXT Workforce'){
 const first=(name||'').trim().split(/\s+/)[0]||'there';
 const lines=missing.map(m=>'- '+m.label+': '+m.how).join('\n');
 return {
  subject:'Please complete your staff profile ('+missing.length+' item'+(missing.length===1?'':'s')+' missing)',
  body:'Hi '+first+',\n\nYour staff profile at '+company+' is not complete yet. These items are still missing:\n\n'+lines+'\n\nOpen NXT Business OS and go to My Profile to finish them: '+appUrl.replace(/\/$/,'')+'/app\n\nYou will keep getting this reminder once a week until everything is complete. Thank you.\n\n'+company
 };
}
/** Is a monthly gross inside the agreed salary range? */
export function rangeStatus(gross:number,min:number|null|undefined,max:number|null|undefined){
 if(min==null||max==null||!Number.isFinite(Number(min))||!Number.isFinite(Number(max)))return 'none' as const;
 if(!Number.isFinite(gross))return 'none' as const;
 return gross<Number(min)?'below' as const:gross>Number(max)?'above' as const:'within' as const;
}
export type OvertimeEntry={work_date:string;hours:number|string;status:string};
/** Approved overtime hours between two dates, both included. */
export function approvedHours(entries:OvertimeEntry[],from:string,to:string){
 const sum=entries.filter(e=>e.status==='approved'&&e.work_date>=from&&e.work_date<=to).reduce((s,e)=>s+Number(e.hours||0),0);
 return Math.round(sum*100)/100;
}
/** A staff member may log overtime for a day that has happened, within the last 62 days. */
export function overtimeDateOk(workDate:string,today:Date=new Date()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(workDate))return false;
 const d=new Date(workDate+'T00:00:00Z'),t=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
 if(Number.isNaN(d.getTime()))return false;
 const diff=(t.getTime()-d.getTime())/86400000;return diff>=0&&diff<=62;
}
