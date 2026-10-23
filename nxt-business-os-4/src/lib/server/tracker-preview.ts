import {createHmac,timingSafeEqual} from 'node:crypto';
const sign=(value:string,key:string)=>createHmac('sha256',key).update(value).digest('hex');
export function previewToken(plan:unknown,workspace:string,user:string,key:string,now=Date.now()){
 if(key.length<32)throw Error('Tracker preview signing is not configured.');
 const expires=now+30*60*1000;return expires+'.'+sign(JSON.stringify({plan,workspace,user,expires}),key);
}
export function verifyPreview(token:string,plan:unknown,workspace:string,user:string,key:string,now=Date.now()){
 if(key.length<32||!/^\d+\.[a-f0-9]{64}$/.test(token))return false;
 const [stamp,signature]=token.split('.'),expires=Number(stamp);if(expires<now||expires>now+30*60*1000)return false;
 const expected=sign(JSON.stringify({plan,workspace,user,expires}),key);return timingSafeEqual(Buffer.from(expected),Buffer.from(signature));
}
