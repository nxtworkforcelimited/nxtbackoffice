// Shared helpers for the Cold Calling module.

// A number can be dialled only when it has enough digits. Notes such as "Verify before visiting" cannot.
export function canDial(phone:string|null|undefined):boolean{
 const digits=String(phone??'').replace(/\D/g,'');
 return digits.length>=7&&digits.length<=15;
}

// Next Business ID for a list, matching the database rule: IB-0001, IB-0002 and so on.
export function nextBusinessId(existing:readonly (string|null|undefined)[]):string{
 let max=0;
 for(const v of existing){const m=/^IB-(\d{1,6})$/.exec(String(v??'').trim());if(m)max=Math.max(max,Number(m[1]));}
 return 'IB-'+String(max+1).padStart(4,'0');
}

export const messageChannels:Record<string,string>={whatsapp:'WhatsApp',sms:'SMS',email:'Email'};
export const defaultSignupBase='https://spotlyafrica.com/';

export function slug(value:string|null|undefined,fallback:string):string{
 const s=String(value??'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
 return s||fallback;
}

// The sign-up link for one business. UTM values group results by message channel, list and category,
// so reports stay readable. The Business ID travels in its own "bid" value and says exactly which business signed up.
// Channel names follow the UTM & QR builder: WhatsApp is source whatsapp / medium social, SMS is sms / sms.
export function signupLink(o:{base?:string;channel:'whatsapp'|'sms'|'email';businessId:string;category?:string|null;list?:string|null}):string{
 let url:URL;
 try{url=new URL((o.base||'').trim()||defaultSignupBase);}catch{url=new URL(defaultSignupBase);}
 if(url.protocol!=='https:'&&url.protocol!=='http:')url=new URL(defaultSignupBase);
 const source=o.channel,medium=o.channel==='whatsapp'?'social':o.channel;
 url.searchParams.set('utm_source',source);
 url.searchParams.set('utm_medium',medium);
 url.searchParams.set('utm_campaign',slug(o.list,'cold-calling'));
 url.searchParams.set('utm_content',slug(o.category,'uncategorised'));
 const bid=String(o.businessId||'').trim();
 if(bid)url.searchParams.set('bid',bid);
 return url.toString();
}

export function whatsappMessage(o:{contact?:string|null;caller?:string|null;business:string;link:string}):string{
 const to=String(o.contact||'').trim()||'there';
 const from=String(o.caller||'').trim()||'the Spotly team';
 return [
  'Hello '+to+', this is '+from+' from Spotly, thank you for your time today.',
  '',
  'Spotly goes live in Zimbabwe on 26 November and puts local businesses in front of customers in Harare. Sign up before then and your first 3 months are free.',
  '',
  'To get '+o.business+' listed, tap your personal link:',
  o.link,
  '',
  'Or reply here with:',
  '1. Your business name and category',
  '2. Your address and a contact number',
  '3. Your website or Instagram, if you have one',
  '',
  'We will confirm once you are listed. Reply STOP if you would rather we did not message you.'
 ].join('\n');
}
