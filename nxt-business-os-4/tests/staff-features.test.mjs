import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const read=f=>readFile(new URL('../'+f,import.meta.url),'utf8');
const js=async(f,swap={})=>{let src=await read(f);for(const [a,b] of Object.entries(swap))src=src.replaceAll(a,b);return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');};
const L=await import(await js('src/lib/staff-profile.ts'));
const A=await import(await js('src/lib/app-access.ts'));

const full={home_address:'1 Main St',emergency_contact:'Jane',emergency_phone:'0771',medical_conditions:'',medical_declared:true};
const allFiles=['CV','National ID','Contract','Profile Photo'].map(category=>({category}));

test('profile completeness: seven required items, nothing counted until it is really there',()=>{
 const none=L.completeness({},[]);
 assert.equal(none.items.length,7);assert.equal(none.percent,0);assert.equal(none.complete,false);
 const all=L.completeness(full,allFiles);assert.equal(all.percent,100);assert.equal(all.complete,true);
 assert.deepEqual(L.completeness({...full,emergency_phone:'  '},allFiles).missing.map(m=>m.key),['next_of_kin']);
 assert.deepEqual(L.completeness({...full,medical_declared:false},allFiles).missing.map(m=>m.key),['medical']);
 assert.equal(L.completeness({...full,medical_declared:false,medical_conditions:'Asthma'},allFiles).complete,true);
 assert.deepEqual(L.completeness(full,[{category:'CV'},{category:'Other'}]).missing.map(m=>m.key),['id','contract','photo']);
 assert.ok(!L.completeness(full,allFiles).items.some(i=>/licen/i.test(i.label)),'licence is optional, never required');
});
test('reminders are weekly and plain; salary range and overtime helpers',()=>{
 assert.equal(L.weekKey(new Date('2026-11-09T10:00:00Z')),'2026-W46');assert.equal(L.weekKey(new Date('2026-11-15T23:00:00Z')),'2026-W46');assert.notEqual(L.weekKey(new Date('2026-11-16T01:00:00Z')),'2026-W46');
 assert.equal(L.weekKey(new Date('2027-01-01T00:00:00Z')),'2026-W53');
 const m=L.reminderEmail('Tendai Moyo',[{label:'CV',how:'Upload your CV in My Profile.'}],'https://app.example/');
 assert.match(m.subject,/1 item missing/);assert.match(m.body,/Hi Tendai/);assert.match(m.body,/- CV: Upload/);assert.match(m.body,/https:\/\/app\.example\/app/);assert.ok(!/medical conditions:/i.test(m.body));
 assert.equal(L.rangeStatus(500,600,900),'below');assert.equal(L.rangeStatus(950,600,900),'above');assert.equal(L.rangeStatus(600,600,900),'within');assert.equal(L.rangeStatus(500,null,null),'none');
 const e=[{work_date:'2026-11-02',hours:'2.5',status:'approved'},{work_date:'2026-11-03',hours:1,status:'pending'},{work_date:'2026-11-04',hours:3,status:'approved'},{work_date:'2026-12-01',hours:9,status:'approved'},{work_date:'2026-11-05',hours:4,status:'rejected'}];
 assert.equal(L.approvedHours(e,'2026-11-01','2026-11-30'),5.5);assert.equal(L.approvedHours(e,'2026-11-03','2026-11-03'),0);
 const today=new Date('2026-11-09T12:00:00Z');
 assert.equal(L.overtimeDateOk('2026-11-09',today),true);assert.equal(L.overtimeDateOk('2026-11-10',today),false);assert.equal(L.overtimeDateOk('2026-09-08',today),true);assert.equal(L.overtimeDateOk('2026-09-07',today),false);assert.equal(L.overtimeDateOk('nope',today),false);
});
test('access screen: only menu apps can be hidden, keys are unique and exist in the app',async()=>{
 assert.deepEqual(A.cleanHidden(['tasks','payroll','x','tasks','loans']),['tasks','loans']);assert.deepEqual(A.cleanHidden('x'),[]);
 const keys=A.accessApps.map(a=>a.key);assert.equal(new Set(keys).size,keys.length);
 const d=await read('src/components/dashboard.tsx'),icons=d.match(/const appIcons=\{([^}]*)\}/)[1];
 for(const k of keys)assert.match(icons,new RegExp('(^|,)'+k+':'),'dashboard has no view named '+k);
 for(const a of A.accessApps.filter(x=>x.cap))assert.match(await read('src/lib/business.ts'),new RegExp("'"+a.cap+"'"));
});
test('server rules: who may log, approve, set ranges, remind and change menus',async()=>{
 const ot=await read('src/app/api/overtime/route.ts'),sp=await read('src/app/api/staff-profile/route.ts'),ha=await read('src/app/api/hidden-apps/route.ts'),pc=await read('src/app/api/payroll-context/route.ts'),d=await read('src/components/dashboard.tsx'),n=await read('src/app/api/notifications/route.ts');
 assert.match(ot,/status:'pending'/);assert.match(ot,/if\(!manage\)return reply\(\{error:'Only the owner or a payroll approver/);
 assert.match(ot,/cannot approve your own overtime/);assert.match(ot,/role!=='owner'/);assert.match(ot,/\.eq\('status','pending'\)\.select/);
 assert.match(sp,/if\(!payroll\)return reply\(\{error:'Only the owner or payroll can set salary ranges/);
 assert.match(sp,/if\(!hr\)return reply\(\{error:'Only the owner or HR/);assert.match(sp,/target!==mine\.data\?\.id&&!hr/);
 const ownGet=sp.slice(sp.indexOf('const own=await db.from'),sp.indexOf('const text='));
 assert.ok(!ownGet.includes('employee_salary_ranges'),'a staff member reading their own profile must never receive the salary range');
 assert.ok(!/salary|monthly_gross|bank|account_number/.test(sp.match(/const profileCols='([^']*)'/)[1]));
 assert.match(ha,/role!=='owner'\)return reply\(\{error:'Only the workspace owner can change/);assert.match(ha,/\['staff','admin'\]\.includes/);assert.match(ha,/c\.workspace\.role==='owner'\|\|own\.error\?\[\]/);
 assert.match(pc,/allowed\(c\.workspace\.role,c\.workspace\.permissions\?\?\[\],'payroll'\)/);
 assert.match(d,/v==='access_control'\?workspace\.role==='owner'/);assert.match(d,/!hiddenApps\.includes\(v\)/);assert.match(d,/staff_profiles:'hr'/);
 assert.match(n,/enqueueStaffReminders/);
});
test('reminders: one per person per week, none when complete, paused or without an email',async()=>{
 const R=await import(await js('src/lib/server/staff-reminders.ts',{"'@/lib/staff-profile'":`'${await js('src/lib/staff-profile.ts')}'`}));
 const tables={
  employees:[
   {id:'e1',tenant_id:'t',name:'Tendai Moyo',email:'tendai@example.com',status:'active',home_address:'',emergency_contact:'',emergency_phone:'',medical_conditions:'',medical_declared:false,reminders_paused:false},
   {id:'e2',tenant_id:'t',name:'Complete',email:'c@example.com',status:'active',home_address:'x',emergency_contact:'x',emergency_phone:'x',medical_conditions:'',medical_declared:true,reminders_paused:false},
   {id:'e3',tenant_id:'t',name:'Paused',email:'p@example.com',status:'active',home_address:'',emergency_contact:'',emergency_phone:'',medical_conditions:'',medical_declared:false,reminders_paused:true},
   {id:'e4',tenant_id:'t',name:'No Email',email:'',status:'active',home_address:'',emergency_contact:'',emergency_phone:'',medical_conditions:'',medical_declared:false,reminders_paused:false}],
  employee_files:['CV','National ID','Contract','Profile Photo'].map(category=>({employee_id:'e2',category})),
  staff_profile_reminders:[],notification_outbox:[]
 };
 const fake={from(name){const st={rows:()=>tables[name],filters:[]};const b={
  select(){return b;},eq(k,v){st.filters.push(r=>r[k]===v);return b;},in(k,vs){st.filters.push(r=>vs.includes(r[k]));return b;},limit(){return Promise.resolve({data:tables[name].filter(r=>st.filters.every(f=>f(r))),error:null});},
  then(res){return Promise.resolve({data:tables[name].filter(r=>st.filters.every(f=>f(r))),error:null}).then(res);},
  insert(row){if(name==='staff_profile_reminders'&&tables[name].some(r=>r.employee_id===row.employee_id&&r.reminder_key===row.reminder_key))return Promise.resolve({error:{message:'duplicate'}});tables[name].push(row);return Promise.resolve({error:null});},
  delete(){return {eq(){return this;},then(res){return Promise.resolve({error:null}).then(res);}};}};return b;}};
 const now=new Date('2026-11-09T10:00:00Z');
 const first=await R.enqueueStaffReminders(fake,'https://app.example',now);
 assert.deepEqual(first,{queued:1,skipped:3});assert.equal(tables.notification_outbox.length,1);assert.equal(tables.notification_outbox[0].recipient,'tendai@example.com');
 const again=await R.enqueueStaffReminders(fake,'https://app.example',new Date('2026-11-12T10:00:00Z'));
 assert.equal(again.queued,0);assert.equal(tables.notification_outbox.length,1,'same week, no second email');
 const next=await R.enqueueStaffReminders(fake,'https://app.example',new Date('2026-11-16T10:00:00Z'));
 assert.equal(next.queued,1);assert.equal(tables.notification_outbox.length,2,'next week the reminder repeats');
});
test('migration 0010 is additive and keeps old overtime as approved; salary ranges are server-only',async()=>{
 const db=new PGlite();
 await db.exec(`create role authenticated;create role anon;
  create table public.tenants(id uuid primary key default gen_random_uuid());
  create table public.employees(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,name text not null,unique(tenant_id,id));
  create table public.employee_extra_hours(id uuid primary key default gen_random_uuid(),tenant_id uuid,employee_id uuid,work_date date,hours numeric);
  insert into public.tenants default values;
  insert into public.employees(tenant_id,name) select id,'Old Staff' from public.tenants;
  insert into public.employee_extra_hours(tenant_id,employee_id,work_date,hours) select tenant_id,id,'2026-10-01',2 from public.employees;`);
 const m=await read('supabase/migrations/202611090010_staff_profiles_overtime_access.sql');
 assert.ok(!/drop table|delete from|truncate/i.test(m));
 await db.exec(m);await db.exec(m);
 assert.equal((await db.query(`select status from public.employee_extra_hours`)).rows[0].status,'approved');
 const e=(await db.query(`select home_address,medical_declared,reminders_paused,licence_expiry from public.employees`)).rows[0];
 assert.deepEqual(e,{home_address:'',medical_declared:false,reminders_paused:false,licence_expiry:null});
 for(const t of ['employee_salary_ranges','member_hidden_apps','staff_profile_reminders'])assert.equal((await db.query(`select has_table_privilege('authenticated','public.${t}','select') s,has_table_privilege('authenticated','public.${t}','insert') i`)).rows[0].s,false,t+' must not be readable by browsers');
 const {rows:[{t,e:emp}]}=await db.query(`select tenant_id t,id e from public.employees`);
 await assert.rejects(db.exec(`insert into public.employee_salary_ranges(tenant_id,employee_id,min_monthly,max_monthly) values('${t}','${emp}',900,600)`),/max_monthly|check/);
 await db.exec(`insert into public.employee_salary_ranges(tenant_id,employee_id,min_monthly,max_monthly) values('${t}','${emp}',600,900)`);
 await assert.rejects(db.exec(`update public.employee_extra_hours set status='maybe'`),/status_check/);
 await db.exec(`insert into public.staff_profile_reminders(tenant_id,employee_id,reminder_key) values('${t}','${emp}','2026-W46')`);
 await assert.rejects(db.exec(`insert into public.staff_profile_reminders(tenant_id,employee_id,reminder_key) values('${t}','${emp}','2026-W46')`),/unique|duplicate/);
});
