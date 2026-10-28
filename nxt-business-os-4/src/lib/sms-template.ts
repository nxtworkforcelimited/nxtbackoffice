export type SmsKind='general'|'invoice'|'quotation'|'payment'|'project'|'ticket';
export type SmsTemplate={event:string;name:string;context_kind:SmsKind;body:string;enabled:boolean;email_subject?:string;email_body?:string};
export type SmsDraft={template?:string;client_id?:string;record_id?:string};
export const smsEvents:Record<string,{name:string;kind:SmsKind}>={welcome:{name:'Account welcome',kind:'general'},invoice_sent:{name:'Invoice sent',kind:'invoice'},invoice_reminder:{name:'Invoice payment reminder',kind:'invoice'},quote_sent:{name:'Quotation sent',kind:'quotation'},payment_received:{name:'Payment received',kind:'payment'},project_update:{name:'Project update',kind:'project'},project_completed:{name:'Project completed',kind:'project'},ticket_received:{name:'Ticket received',kind:'ticket'},ticket_resolved:{name:'Ticket resolved',kind:'ticket'}};
export const smsPlaceholders:Record<SmsKind,string[]>={general:['name','portal_link'],invoice:['name','portal_link','invoice_number','invoice_total','balance','due_date'],quotation:['name','portal_link','quote_number','quote_total','due_date'],payment:['name','portal_link','invoice_number','payment_amount','payment_reference','balance','payment_date'],project:['name','portal_link','project_name'],ticket:['name','portal_link','ticket_number']};
export function validateSmsTemplate(body:string,kind:SmsKind,max=480){
 if(!body.trim()||body.length>max)throw Error('Enter a message of up to '+max+' characters.');
 const remainder=body.replace(/\{([a-z_]+)\}/g,(match,key)=>smsPlaceholders[kind].includes(key)?'':match);
 if(/[{}]/.test(remainder))throw Error('Use only the placeholders listed for this message type.');
}
export function renderSmsTemplate(template:Pick<SmsTemplate,'body'|'context_kind'>,values:Record<string,string>){
 validateSmsTemplate(template.body,template.context_kind);
 const body=template.body.replace(/\{([a-z_]+)\}/g,(_,key)=>{if(!values[key])throw Error('Select the related record before previewing this message.');return values[key];});
 if(body.length>1600)throw Error('The personalised message is too long. Shorten the template.');
 return body;
}
export const automaticSmsEvents=['welcome','invoice_sent','project_update','project_completed','ticket_received','ticket_resolved'];
export const financeKinds=['invoice','quotation','payment'];
export function renderClientMessage(body:string,kind:SmsKind,values:Record<string,string>,limit=10000){
 validateSmsTemplate(body,kind,limit);
 const rendered=body.replace(/\{([a-z_]+)\}/g,(_,key)=>{if(values[key]===undefined||values[key]==='')throw Error('The related record is missing '+key.replaceAll('_',' ')+'.');return values[key];});
 if(rendered.length>limit)throw Error('The personalised message is too long. Shorten the template.');
 return rendered;
}
