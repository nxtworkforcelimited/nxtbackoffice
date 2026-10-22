export const capabilities=['crm','delivery','content','approve_content','documents','finance','accounting','payroll','sms','reports','website','hr','approve_leave','tickets','task_admin','finance_admin','payroll_admin'] as const;
export type Capability=typeof capabilities[number];
export type BusinessKind='quote'|'invoice'|'payroll'|'request'|'sms';
export type BusinessItem={id:string;tenant_id:string;kind:BusinessKind;title:string;client_id:string|null;status:string;currency:string;payload:Record<string,any>;total:number;paid:number;due_date:string|null;reference:string;created_at:string;parent_id?:string|null;deleted_at?:string|null};
export type Comment={id:string;post_id:string;body:string;author_id:string;created_at:string};
export type Member={name?:string;email?:string;user_id:string;role:string;client_id:string|null;permissions:string[]};
export type BusinessData={canRemoveInvoices?:boolean;items:BusinessItem[];comments:Comment[];members:Member[];payments:{payment_method?:'bank'|'cash'|null;id:string;invoice_id:string;amount:number;reference:string;created_at:string}[];rules:Record<string,any>};
export const emptyBusiness:BusinessData={items:[],comments:[],members:[],payments:[],rules:{}};
export function allowed(role:string,permissions:string[],cap:string){return role==='owner'||permissions.includes(cap);}
export function formatMoney(amount:number|string,currency='USD'){return `${currency==='ZWG'?'ZiG':currency} ${Number(amount).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}`;}
export const demoBusiness:BusinessData={...emptyBusiness,items:[
{id:'i1',tenant_id:'demo',kind:'invoice',title:'October digital growth retainer',client_id:'c1',status:'issued',currency:'USD',payload:{lines:[{description:'Monthly digital growth retainer',quantity:1,unit_price:250}],tax_rate:0,subtotal:250,tax:0,recurrence:'monthly'},total:250,paid:0,due_date:'2026-10-25',reference:'NXT-DEMO-001',created_at:'2026-10-16'},
{id:'q1',tenant_id:'demo',kind:'quote',title:'Website and client experience',client_id:'c2',status:'draft',currency:'GBP',payload:{lines:[{description:'Website design and development',quantity:1,unit_price:1200}],tax_rate:0,subtotal:1200,tax:0},total:1200,paid:0,due_date:'2026-10-30',reference:'NXT-DEMO-Q01',created_at:'2026-10-16'},
{id:'r1',tenant_id:'demo',kind:'request',title:'Please update our homepage banner',client_id:'c1',status:'open',currency:'USD',payload:{description:'We would like to review the new seasonal banner.'},total:0,paid:0,due_date:null,reference:'REQ-DEMO-01',created_at:'2026-10-16'}],members:[{user_id:'demo-owner',role:'owner',client_id:null,permissions:[...capabilities]},{user_id:'demo-staff',role:'staff',client_id:null,permissions:['delivery','content','documents']}]};
