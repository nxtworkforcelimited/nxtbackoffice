'use client';
import {useEffect,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import type {Workspace} from '@/lib/types';
import {completeness,profileItems} from '@/lib/staff-profile';
import {CheckCircle2,Circle,Upload} from 'lucide-react';

type Emp={name:string;home_address:string;emergency_contact:string;emergency_phone:string;next_of_kin_relationship:string;medical_conditions:string;medical_declared:boolean;licence_number:string;licence_expiry:string|null};
const sample:Emp={name:'Sample Staff',home_address:'',emergency_contact:'',emergency_phone:'',next_of_kin_relationship:'',medical_conditions:'',medical_declared:false,licence_number:'',licence_expiry:null};
const docs=[
 {category:'Profile Photo',label:'Profile photo',hint:'JPG or PNG, up to 5 MB. It becomes your picture at the top right.',required:true,types:['image/jpeg','image/png'],max:5242880},
 {category:'CV',label:'CV',hint:'PDF, JPG, PNG or DOCX, up to 10 MB.',required:true},
 {category:'National ID',label:'ID copy',hint:'A clear copy of your National ID.',required:true},
 {category:'Contract',label:'Signed contract',hint:'Your signed employment contract.',required:true},
 {category:'Driver Licence',label:'Driver licence',hint:'Optional. Only if your role needs one.',required:false}
] as const;
const okTypes=['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

export default function MyProfile({workspace,demo=false,onChanged}:{workspace:Workspace;demo?:boolean;onChanged?:()=>void}){
 const [emp,setEmp]=useState<Emp|null>(demo?sample:null),[files,setFiles]=useState<{category:string;name:string}[]>([]),[loaded,setLoaded]=useState(demo),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const base='/api/staff-profile?workspace='+workspace.id;
 async function load(){const r=await fetch(base,{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setEmp(b.employee);setFiles(b.files??[]);setLoaded(true);}
 useEffect(()=>{if(!demo)load().catch(e=>{setError(e.message);setLoaded(true);});},[workspace.id,demo]);// eslint-disable-line react-hooks/exhaustive-deps
 if(!loaded)return <p role="status">Loading…</p>;
 if(!emp)return <section className="panel client-sites-empty"><h3>Your staff record is not set up yet</h3><p>Ask NXT management to add you under Staff. Then your profile appears here.</p>{error&&<p className="notice error" role="alert">{error}</p>}</section>;
 const comp=completeness(emp,files);
 const set=<K extends keyof Emp>(k:K,v:Emp[K])=>setEmp(e=>e?{...e,[k]:v}:e);
 async function save(){
  setBusy(true);setError('');setNotice('');
  try{
   const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',home_address:emp!.home_address,emergency_contact:emp!.emergency_contact,emergency_phone:emp!.emergency_phone,next_of_kin_relationship:emp!.next_of_kin_relationship,medical_conditions:emp!.medical_conditions,medical_declared:emp!.medical_declared,licence_number:emp!.licence_number,licence_expiry:emp!.licence_expiry||''})});
   const b=await r.json();if(!r.ok)throw Error(b.error);setNotice('Profile saved.');await load();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function upload(category:string,file:File,types:readonly string[],max:number){
  setBusy(true);setError('');setNotice('');
  try{
   if(!types.includes(file.type))throw Error(category==='Profile Photo'?'Use a JPG or PNG photo.':'Use PDF, JPG, PNG or DOCX.');
   if(file.size===0||file.size>max)throw Error('Choose a file up to '+Math.round(max/1048576)+' MB.');
   const peopleBase='/api/people?workspace='+workspace.id+'&area=employees';
   const own=await fetch(peopleBase,{cache:'no-store'}),ob=await own.json();
   const me=(ob.employees??[])[0];if(!own.ok||!me)throw Error('Your staff record could not be found.');
   const res=await fetch(peopleBase,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'file',employee_id:me.id,name:file.name.slice(0,200),category})}),row=await res.json();
   if(!res.ok)throw Error(row.error||'Could not prepare the upload.');
   const db=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
   const up=await db.storage.from('employee-files').upload(row.object_path,file,{contentType:file.type});
   if(up.error)throw Error('Upload failed. Please choose the file again.');
   setNotice(category+' uploaded.');await load();onChanged?.();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="people-area my-profile">
  <div className="panel my-profile-progress"><div className="build-section-head"><div><span className="eyebrow">YOUR PROFILE</span><h2>{comp.complete?'Your profile is complete':comp.percent+'% complete'}</h2></div><strong>{comp.percent}%</strong></div>
   <div className="client-site-progress" role="progressbar" aria-valuenow={comp.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness"><i style={{width:comp.percent+'%'}}/></div>
   <ul className="my-profile-checks">{comp.items.map(i=><li key={i.key} className={i.done?'done':''}>{i.done?<CheckCircle2 size={16}/>:<Circle size={16}/>}<span>{i.label}</span>{!i.done&&<small>{i.how}</small>}</li>)}</ul>
   {!comp.complete&&<small>Until everything is complete you will get a reminder email once a week.</small>}
  </div>
  {demo&&<p className="notice">Sample only. Sign in to complete your own profile.</p>}
  {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
  <fieldset className="panel people-form" disabled={busy||demo}><span className="eyebrow">DOCUMENTS</span><h3>Your documents</h3>
   <div className="my-docs">{docs.map(d=>{const have=files.filter(f=>f.category===d.category);return <div key={d.category} className="my-doc-row"><div><strong>{d.label}{!d.required&&<small> (optional)</small>}</strong><small>{have.length?'Uploaded: '+have[have.length-1].name:d.hint}</small></div><span className={'integration-pill '+(have.length?'connected':d.required?'attention':'planned')}>{have.length?'Uploaded':d.required?'Missing':'Optional'}</span><label className="secondary logo-upload-button"><Upload size={14}/>{have.length?'Replace':'Upload'}<input type="file" accept={('types' in d?d.types:okTypes).join(',')} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void upload(d.category,f,'types' in d?d.types:okTypes,'max' in d?d.max:10485760);}}/></label></div>;})}</div>
  </fieldset>
  <form className="panel people-form" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy||demo}><span className="eyebrow">DETAILS</span><h3>About you</h3>
   <label>Home address<textarea rows={2} maxLength={500} value={emp.home_address} onChange={e=>set('home_address',e.target.value)} placeholder="Street, suburb, city"/></label>
   <div className="form-grid"><label>Next of kin name<input maxLength={160} value={emp.emergency_contact} onChange={e=>set('emergency_contact',e.target.value)}/></label><label>Relationship<input maxLength={80} value={emp.next_of_kin_relationship} onChange={e=>set('next_of_kin_relationship',e.target.value)} placeholder="e.g. Spouse, Parent"/></label><label>Next of kin phone<input maxLength={40} value={emp.emergency_phone} onChange={e=>set('emergency_phone',e.target.value)} inputMode="tel"/></label></div>
   <label>Medical conditions<textarea rows={3} maxLength={2000} value={emp.medical_conditions} onChange={e=>set('medical_conditions',e.target.value)} placeholder="Anything we should know in an emergency, for example asthma, diabetes, allergies"/></label>
   <label className="build-portal-toggle"><input type="checkbox" checked={emp.medical_declared} onChange={e=>set('medical_declared',e.target.checked)}/><span>I have no medical conditions to declare</span></label>
   <small>Medical details are private. They are visible to you, the owner and HR only.</small>
   <div className="form-grid"><label>Driver licence number (optional)<input maxLength={60} value={emp.licence_number} onChange={e=>set('licence_number',e.target.value)}/></label><label>Licence expiry (optional)<input type="date" value={emp.licence_expiry??''} onChange={e=>set('licence_expiry',e.target.value||null)}/></label></div>
   <button className="primary">Save my details</button>
  </fieldset></form>
  <p className="footnote">{profileItems.length} items make up a complete profile. Your salary and pay details are managed by payroll and are not shown here.</p>
 </section>;
}
