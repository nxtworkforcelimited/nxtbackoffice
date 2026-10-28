import {renderClientMessage,renderSmsTemplate,type SmsTemplate} from './sms-template';
type Document={id:string;kind:string;reference:string;total:number|string;paid:number|string;currency:string;due_date:string|null};
type Payment={id:string;invoice_id:string;amount:number|string;reference:string;created_at:string};
export function prepareFinanceMessage({document,payment,name,template,channel}:{document:Document;payment?:Payment|null;name:string;template:SmsTemplate;channel:'sms'|'email'}){
 const kind=template.context_kind;
 if(kind==='quotation'&&document.kind!=='quote'||['invoice','payment'].includes(kind)&&document.kind!=='invoice'||!['invoice','quotation','payment'].includes(kind))throw Error('Choose a template for this document type.');
 const balance=Math.max(0,Math.round((Number(document.total)-Number(document.paid))*100)/100);
 if(template.event==='invoice_reminder'&&balance<=0)throw Error('This invoice is fully paid. A payment reminder cannot be sent.');
 const money=(n:number|string)=>document.currency+' '+Number(n).toFixed(2);
 const values:Record<string,string>={name,portal_link:'https://os.nxt-workforce.com/login',invoice_number:document.reference,quote_number:document.reference,invoice_total:money(document.total),quote_total:money(document.total),balance:money(balance),due_date:document.due_date??'Not specified'};
 if(kind==='payment'){
  if(!payment||payment.invoice_id!==document.id)throw Error('Choose a recorded payment for this invoice.');
  values.payment_amount=money(payment.amount);values.payment_reference=payment.reference;values.payment_date=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Harare',day:'2-digit',month:'short',year:'numeric'}).format(new Date(payment.created_at));
 }
 if(channel==='sms')return {subject:'',body:renderSmsTemplate(template,values)};
 if(!template.email_subject?.trim()||!template.email_body?.trim())throw Error('Add an email subject and message to this template first.');
 const subject=renderClientMessage(template.email_subject,kind,values,300);
 if(/[\r\n]/.test(subject))throw Error('Email subjects must be on one line.');
 return {subject,body:renderClientMessage(template.email_body,kind,values,10000)};
}
