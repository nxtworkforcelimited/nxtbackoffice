// SMS templates with merge fields. Pure functions, used by the server (to send) and the page (to preview).
export const mergeFields=[
 {key:'client_name',label:'Client name',sample:'Acme Holdings'},
 {key:'company',label:'Your company name',sample:'NXT Workforce'},
 {key:'invoice_number',label:'Invoice number',sample:'INV-1042'},
 {key:'amount',label:'Invoice total',sample:'USD 450.00'},
 {key:'balance',label:'Balance still due',sample:'USD 225.00'},
 {key:'paid',label:'Amount paid',sample:'USD 225.00'},
 {key:'due_date',label:'Due date',sample:'15 Nov 2026'},
 {key:'receipt_number',label:'Receipt number',sample:'RCT-3F9A12BC'},
 {key:'receipt_link',label:'Link to the receipt',sample:'https://nxt-business-os.vercel.app/r/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGhIjKlMn'}
] as const;
export type MergeKey=typeof mergeFields[number]['key'];
export type MergeValues=Partial<Record<MergeKey,string>>;

export type StarterTemplate={key:string;name:string;category:'invoice'|'receipt'|'reminder'|'general';body:string};
export const starterTemplates:StarterTemplate[]=[
 {key:'invoice-issued',name:'Invoice issued',category:'invoice',body:'Hi {client_name}, your invoice {invoice_number} for {amount} has been processed by {company}. Due {due_date}. Thank you.'},
 {key:'payment-due-soon',name:'Payment due soon',category:'reminder',body:'Hi {client_name}, a friendly reminder that invoice {invoice_number} ({balance} outstanding) is due on {due_date}. - {company}'},
 {key:'payment-overdue',name:'Payment overdue',category:'reminder',body:'Hi {client_name}, invoice {invoice_number} ({balance} outstanding) was due on {due_date}. Please arrange payment or reply to this message. - {company}'},
 {key:'receipt',name:'Payment received (receipt)',category:'receipt',body:'Thank you {client_name}. We received {paid} for invoice {invoice_number}. Your receipt {receipt_number}: {receipt_link} Balance: {balance}. - {company}'},
 {key:'welcome',name:'Welcome',category:'general',body:'Welcome to {company}, {client_name}. We are glad to be working with you. Reply here if you need anything.'}
];

const FIELD=/\{([a-z_]+)\}/g;
const known=new Set<string>(mergeFields.map(f=>f.key));

/** Field names used in a template that we do not support (typos like {clientname}). */
export function unknownFields(body:string){
 const bad=new Set<string>();
 for(const m of body.matchAll(FIELD))if(!known.has(m[1]))bad.add(m[1]);
 return [...bad];
}
/** Fields a template uses, in order, without repeats. */
export function usedFields(body:string){
 const seen=new Set<MergeKey>();
 for(const m of body.matchAll(FIELD))if(known.has(m[1]))seen.add(m[1] as MergeKey);
 return [...seen];
}
/** Fields the template needs that have no value yet (for example an invoice was not picked). */
export function missingFields(body:string,values:MergeValues){
 return usedFields(body).filter(k=>!String(values[k]??'').trim());
}
/** Fill the template. Unknown or empty fields are left as {field} so they are visible in the preview. */
export function renderTemplate(body:string,values:MergeValues){
 return body.replace(FIELD,(whole,key:string)=>{const v=known.has(key)?String(values[key as MergeKey]??'').trim():'';return v||whole;});
}
export function sampleValues():MergeValues{
 return Object.fromEntries(mergeFields.map(f=>[f.key,f.sample])) as MergeValues;
}
/** GSM-7 text fits 160 characters in one SMS (153 each when joined). Anything outside it drops to 70 (67). */
const GSM=/^[A-Za-z0-9 @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\r\n^{}\\[~\]|€]*$/;
export function smsSegments(text:string){
 const length=[...text].length,unicode=!GSM.test(text);
 const single=unicode?70:160,joined=unicode?67:153;
 return {length,unicode,segments:length===0?0:length<=single?1:Math.ceil(length/joined)};
}
export function money(currency:string|null|undefined,value:number|string|null|undefined){
 const n=Number(value??0);return (currency||'USD')+' '+(Number.isFinite(n)?n:0).toFixed(2);
}
export function shortReceipt(paymentId:string){return 'RCT-'+String(paymentId).replace(/-/g,'').slice(0,8).toUpperCase();}
export function dueDateText(value:string|null|undefined){
 if(!value)return '';const d=new Date(value+(String(value).length===10?'T00:00:00Z':''));
 return Number.isNaN(d.getTime())?'':d.toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'});
}
/** Night-time check in Harare (CAT, UTC+2): no marketing or reminder texts between 20:00 and 07:00. */
export function isQuietHour(now=new Date()){
 const hour=(now.getUTCHours()+2)%24;return hour>=20||hour<7;
}
