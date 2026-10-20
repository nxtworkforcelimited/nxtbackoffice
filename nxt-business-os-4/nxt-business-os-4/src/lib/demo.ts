import type { Data,RecordRow } from './types';
const row=(id:string,title:string,status:string,extra:Partial<RecordRow>={}):RecordRow=>({id,tenant_id:'demo',title,status,client_id:null,client_visible:false,created_at:'2026-10-14T08:00:00Z',...extra});
export const demoData:Data={
clients:[row('c1','Kavi.R (sample)' ,'active',{email:'hello@example.com'}),row('c2','Horizon Properties','active',{email:'team@example.com'}),row('c3','Mavambo Foods','active',{email:'contact@example.com'})],
deals:[row('d1','Website & client experience','proposal',{client_id:'c1',amount:2400,currency:'USD'}),row('d2','Outbound sales support','qualified',{client_id:'c2',amount:1800,currency:'USD'}),row('d3','Digital growth retainer','new',{client_id:'c3',amount:900,currency:'USD'}),row('d4','Brand launch package','won',{client_id:'c1',amount:1500,currency:'USD'})],
projects:[row('p1','A fresh digital home','active',{client_id:'c1',client_visible:true,due_date:'2026-10-28',description:'Website design, content and launch.'}),row('p2','October growth campaign','review',{client_id:'c3',client_visible:true,due_date:'2026-10-21'}),row('p3','Sales outreach setup','planned',{client_id:'c2',due_date:'2026-11-02'})],
tasks:[row('t1','Review homepage concepts','in_progress',{client_id:'c1',client_visible:true,due_date:'2026-10-16'}),row('t2','Prepare campaign copy','todo',{client_id:'c3',due_date:'2026-10-18'}),row('t3','Confirm discovery notes','done',{client_id:'c2',due_date:'2026-10-14'})],
social_posts:[row('s1','Your next chapter starts online','client_review',{client_id:'c1',client_visible:true,channel:'LinkedIn',due_date:'2026-10-16',description:'A new digital home designed around your customers.'}),row('s2','Meet the people behind the brand','draft',{client_id:'c3',channel:'LinkedIn',due_date:'2026-10-20'})],
documents:[row('f1','Website creative brief.pdf','shared',{client_id:'c1',client_visible:true}),row('f2','Campaign content guidelines.pdf','internal',{client_id:'c3'})]
};
