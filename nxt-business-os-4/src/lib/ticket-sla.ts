// Ticket deadlines. The database stores them; this mirrors the same rules so older tickets (made before deadlines were stored) still show one.
// Clock hours, not working hours. Urgent 1 / 4, High 4 / 24, Normal 8 / 72, Low 24 / 168 (first reply / resolution).
export const slaHours={Urgent:{reply:1,fix:4},High:{reply:4,fix:24},Normal:{reply:8,fix:72},Low:{reply:24,fix:168}} as const;
type P=keyof typeof slaHours;
export type SlaTicket={priority:string;status:string;created_at:string;first_response_due?:string|null;resolution_due?:string|null;first_response_at?:string|null;resolved_at?:string|null};
export type SlaState='met'|'ok'|'soon'|'overdue';
export type SlaLine={state:SlaState;label:string;due:Date};

const done=(s:string)=>s==='Resolved'||s==='Closed';
const hours=(p:string)=>slaHours[(p in slaHours?p:'Normal') as P];
export function duration(ms:number){
 const m=Math.max(0,Math.round(ms/60000));
 if(m<60)return m+'m';
 const h=Math.floor(m/60);if(h<48)return h+'h'+(m%60&&h<6?' '+(m%60)+'m':'');
 const d=Math.floor(h/24);return d+'d'+(h%24?' '+(h%24)+'h':'');
}
function line(kind:'Reply'|'Resolve',due:Date,finished:boolean,windowMs:number,now:Date):SlaLine{
 if(finished)return {state:'met',label:kind==='Reply'?'Replied':'Resolved',due};
 const left=due.getTime()-now.getTime();
 if(left<0)return {state:'overdue',label:kind+' overdue by '+duration(-left),due};
 return {state:left<windowMs*0.2?'soon':'ok',label:kind+' due in '+duration(left),due};
}
export function ticketSla(t:SlaTicket,now=new Date()){
 const created=new Date(t.created_at).getTime(),h=hours(t.priority);
 const replyDue=new Date(t.first_response_due??created+h.reply*3600000),fixDue=new Date(t.resolution_due??created+h.fix*3600000);
 // Older tickets have no first-reply time; anything past "New" was picked up.
 const replied=Boolean(t.first_response_at)||t.status!=='New';
 return {
  reply:line('Reply',replyDue,replied||done(t.status),h.reply*3600000,now),
  resolve:line('Resolve',fixDue,done(t.status),h.fix*3600000,now)
 };
}
/** The one line shown in lists: the most urgent thing still open. */
export function slaHeadline(t:SlaTicket,now=new Date()){
 if(done(t.status))return {state:'met' as SlaState,label:'Resolved'};
 const s=ticketSla(t,now),rank={overdue:0,soon:1,ok:2,met:3};
 const open=[s.reply,s.resolve].filter(x=>x.state!=='met').sort((a,b)=>rank[a.state]-rank[b.state]||a.due.getTime()-b.due.getTime());
 return open[0]??{state:'met' as SlaState,label:'Replied'};
}
export function isOverdue(t:SlaTicket,now=new Date()){return !done(t.status)&&slaHeadline(t,now).state==='overdue';}
export const clientCategories=['Website Change','Website Bug','Content Update','Hosting / DNS','Billing Query'] as const;
export const internalCategories=['General IT','Back Office / System','CRM / Pipeline','Projects / Tasks','Finance / Expenses','Accounting','Payroll','Leave / Loans','Tickets / IT Support','SMS / Messaging','Phone / Calling','Marketing / Social','Documents / Files','Account / Login Access','Hardware / Device','Network / Connectivity','Website / Domain','Other'] as const;
