export type SmsKind='general'|'invoice'|'project'|'ticket';
export type SmsTemplate={event:string;name:string;context_kind:SmsKind;body:string;enabled:boolean};
export type SmsDraft={template?:string;client_id?:string;record_id?:string};
export const smsEvents:Record<string,{name:string;kind:SmsKind}>={welcome:{name:'Account welcome',kind:'general'},invoice_sent:{name:'Invoice sent',kind:'invoice'},project_update:{name:'Project update',kind:'project'},project_completed:{name:'Project completed',kind:'project'},ticket_received:{name:'Ticket received',kind:'ticket'},ticket_resolved:{name:'Ticket resolved',kind:'ticket'}};
export const smsPlaceholders:Record<SmsKind,string[]>={general:['name','portal_link'],invoice:['name','portal_link','invoice_number'],project:['name','portal_link','project_name'],ticket:['name','portal_link','ticket_number']};
export function validateSmsTemplate(body:string,kind:SmsKind){
 if(!body.trim()||body.length>480)throw Error('Enter a message of up to 480 characters.');
 const remainder=body.replace(/\{([a-z_]+)\}/g,(match,key)=>smsPlaceholders[kind].includes(key)?'':match);
 if(/[{}]/.test(remainder))throw Error('Use only the placeholders listed for this message type.');
}
export function renderSmsTemplate(template:Pick<SmsTemplate,'body'|'context_kind'>,values:Record<string,string>){
 validateSmsTemplate(template.body,template.context_kind);
 const body=template.body.replace(/\{([a-z_]+)\}/g,(_,key)=>{if(!values[key])throw Error('Select the related record before previewing this message.');return values[key];});
 if(body.length>1600)throw Error('The personalised message is too long. Shorten the template.');
 return body;
}
