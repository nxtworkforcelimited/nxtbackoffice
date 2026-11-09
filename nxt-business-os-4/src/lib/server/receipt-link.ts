import {createHmac,timingSafeEqual} from 'node:crypto';
// A receipt link is the payment id plus a signature only the server can make.
// It cannot be guessed, it is the same every time for one payment (so repeat sends match), and it shows one receipt only.
// To cancel every link ever sent, change RECEIPT_LINK_SECRET.
const secret=()=>process.env.RECEIPT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const mac=(id:string)=>createHmac('sha256',secret()).update('receipt:'+id).digest('base64url').slice(0,32);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function signReceipt(paymentId:string):string|null{
 if(!UUID.test(paymentId)||!secret())return null;
 return Buffer.from(paymentId.replace(/-/g,''),'hex').toString('base64url')+mac(paymentId.toLowerCase());
}
export function verifyReceipt(token:string):string|null{
 if(!/^[A-Za-z0-9_-]{54}$/.test(token)||!secret())return null;
 const hex=Buffer.from(token.slice(0,22),'base64url').toString('hex');
 if(hex.length!==32)return null;
 const id=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
 const a=Buffer.from(token.slice(22)),b=Buffer.from(mac(id));
 return a.length===b.length&&timingSafeEqual(a,b)?id:null;
}
