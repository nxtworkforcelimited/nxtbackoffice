import {isIP} from 'node:net';
import {createHash} from 'node:crypto';
import {PublicError, readPublicJson, reply, takeQuota, publicFailure} from '../../../../lib/public-services';
import {zispaTemplate} from '../../../../lib/zispa-template';

type Contact = Record<'name'|'organisation'|'physical'|'postal'|'city'|'country'|'phone'|'fax'|'email'|'handle',string>;
function field(value: unknown, label: string, optional = false, max = 200): string {
  if (value == null && optional) return '';
  if (typeof value !== 'string' || value.length > max || /[^\x20-\x7e]/.test(value)) throw new PublicError('Check '+label+'. Use a single line of plain text without accents.');
  const text = value.trim();
  if (!optional && !text) throw new PublicError('Please complete '+label+'.');
  if (/\[.*\]|<.*>|\{\{/.test(text)) throw new PublicError('Please enter your actual '+label+'.');
  return text;
}
function contact(value: unknown, label: string): Contact {
  if (!value || typeof value !== 'object') throw new PublicError('Please complete '+label+'.');
  const v = value as Record<string, unknown>;
  const keys = ['name','organisation','physical','postal','city','country','phone','fax','email','handle'] as const;
  const result = {} as Contact;
  for (const key of keys) result[key] = field(v[key],label+' '+key,key==='fax'||key==='handle',key==='email'?254:200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new PublicError('Enter a valid '+label+' email.');
  if (!/^[+\d][\d ()+.\-]{5,39}$/.test(result.phone)) throw new PublicError('Enter a valid '+label+' phone number with country code.');
  return result;
}
function hostname(value: string) {
  return value.length <= 253 && value.includes('.') && value.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}
export async function POST(request: Request) {
  try {
    const v = await readPublicJson(request,18000);
    if (!v || typeof v !== 'object' || v.website) throw new PublicError('Please check your details.');
    const domain = field(v.domain,'domain',false,253).toLowerCase();
    if (!hostname(domain) || !/^[^.]+\.(?:co\.zw|com|net|org|co\.uk|co\.za|co\.com)$/.test(domain)) throw new PublicError('Please enter a supported domain name.');
    if (v.consent !== true) throw new PublicError('Please confirm you are authorised to submit this application.');
    if (typeof v.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.requestId)) throw new PublicError('Please refresh the page and try again.');
    const owner = contact(v.owner,'domain owner');
    const admin = v.adminSame === true ? {...owner,handle:''} : contact(v.admin,'admin contact');
    const description = field(v.description,'organisation description',false,300);
    const usage = field(v.usage,'proposed domain usage',false,300);
    const notices = field(v.notices,'street address for notices');
    if (/\bP\.?\s*O\.?\s*(box|bag)\b|\bpost\s*office\s*(box|bag)\b/i.test(notices)) throw new PublicError('Use a street address for notices, not a PO box or bag.');
    const local = domain.endsWith('.co.zw');
    const technical = local ? (v.technicalSame === true ? {...admin} : contact(v.technical,'technical contact')) : null;
    const servers: {host:string;ip:string}[] = [];
    if (local) {
      if (!Array.isArray(v.nameservers) || v.nameservers.length<2 || v.nameservers.length>4) throw new PublicError('Provide two to four nameservers.');
      for (const server of v.nameservers) {
        const host=field(server?.host,'nameserver hostname',false,253).toLowerCase();
        const ip=field(server?.ip,'nameserver IP address',false,45);
        if (!hostname(host) || !isIP(ip)) throw new PublicError('Enter valid nameserver hostnames and IP addresses.');
        if (servers.some(s=>s.host===host||s.ip===ip)) throw new PublicError('Each nameserver must have a different hostname and IP address.');
        servers.push({host,ip});
      }
    }
    const key=process.env.RESEND_API_KEY, from=process.env.NOTIFICATION_FROM;
    await takeQuota(request,'domain');
    // Recheck immediately before accepting a .co.zw application. Never trust a browser-supplied status.
    if (local) {
      const check = await fetch('https://www.zispa.org.zw/api/domain/'+encodeURIComponent(domain), {headers:{Accept:'application/rdap+json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(6000)});
      const record=await check.json();
      if (check.status===200 && record.ldhName?.toLowerCase()===domain) throw new PublicError('This domain is unavailable. Please choose another name.',409);
      if (!(check.status===404 && record.errorCode===404 && Array.isArray(record.rdapConformance))) throw new PublicError('We could not check this domain just now. Your details are still here; please try again.',503);
    }
    const fields: Record<string,string>={domain,description,usage,notices};
    for (const [prefix,c] of Object.entries({owner,admin,technical})) if(c) for(const [k,value] of Object.entries(c)) fields[prefix+'.'+k]=value;
    for(let i=0;i<4;i++) {fields['ns'+(i+1)+'.host']=servers[i]?.host||'';fields['ns'+(i+1)+'.ip']=servers[i]?.ip||'';}
    const text = local ? zispaTemplate.replace(/\{\{([\w.]+)\}\}/g,(_,name)=>fields[name]??'').replace(/\r?\n/g,'\r\n')
      : 'NXT INTERNATIONAL DOMAIN APPLICATION\r\n'+Object.entries(fields).filter(([k])=>!k.startsWith('ns')).map(([k,val])=>k+': '+val).join('\r\n')+'\r\n';
    if (!key || !from) return reply({prepared:true,domain,filename:domain+'.txt',attachment:text,
      message:'Your application is ready. Download it, then attach it to an email to dns@nxt-workforce.com with your domain name as the subject.'});
    const idempotencyKey='domain-'+createHash('sha256').update(v.requestId+'\n'+text).digest('hex');
    const sent = await fetch('https://api.resend.com/emails', {
      method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},
      body:JSON.stringify({from,to:['dns@nxt-workforce.com'],reply_to:owner.email,subject:domain,
        text:local ? 'New domain application for '+domain+'. The completed ASCII ZISPA template is attached. Confirm payment, the required signed owner documents and authoritative DNS before submitting to ZISPA from the registered registrar mailbox.'
          : 'New international domain application for '+domain+'. The customer details are attached. Confirm availability and pricing, then arrange registration through the NXT 123 Reg account. No purchase has been made by this form.',
        attachments:[{filename:domain+'.txt',content:Buffer.from(text,'ascii').toString('base64')}]}),
      signal:AbortSignal.timeout(12000),
    });
    if (!sent.ok || !(await sent.json()).id) throw new PublicError('We could not send your application. Your details are still here; please try again or email dns@nxt-workforce.com.',503);
    return reply({ok:true,domain,message:'Your application has been sent to our domain team. We will contact you to confirm the registration details and payment.'},201);
  } catch(error) { return publicFailure(error); }
}
