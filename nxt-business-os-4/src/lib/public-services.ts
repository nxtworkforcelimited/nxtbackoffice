import {createHash} from 'node:crypto';

export class PublicError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function reply(data: unknown, status = 200) {
  return Response.json(data, {status, headers: {'Cache-Control': 'private, no-store'}});
}
export async function readPublicJson(request: Request, maxBytes: number) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new PublicError('Please use the form on the NXT website.', 403);
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new PublicError('Please send JSON.', 415);
  if (Number(request.headers.get('content-length')) > maxBytes) throw new PublicError('Your message is too long.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new PublicError('Please complete the form.');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const {value, done} = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {await reader.cancel(); throw new PublicError('Your message is too long.', 413);}
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof PublicError) throw error;
    throw new PublicError('Please check your details and try again.');
  }
}
// Best-effort per-instance throttling. Provider/account budgets remain the spending limit.
// This does not depend on, read or modify the private CRM database.
const counters = new Map<string,{hits:number;expires:number}>();
export async function takeQuota(request: Request, kind: 'ai' | 'domain') {
  const now=Date.now();
  for(const [key,value] of counters)if(value.expires<=now)counters.delete(key);
  const ip=request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim()||'unknown';
  const fingerprint=createHash('sha256').update(ip).digest('hex');
  const hour=Math.floor(now/3600000),day=Math.floor(now/86400000);
  const limits=[{key:kind+':ip:'+fingerprint+':'+hour,max:kind==='ai'?12:5,expires:(hour+1)*3600000},
    {key:kind+':day:'+day,max:kind==='ai'?60:30,expires:(day+1)*86400000}];
  if(limits.some(limit=>(counters.get(limit.key)?.hits||0)>=limit.max))throw new PublicError('Please try again later, or contact our team on WhatsApp.',429);
  for(const limit of limits)counters.set(limit.key,{hits:(counters.get(limit.key)?.hits||0)+1,expires:limit.expires});
}
export function publicFailure(error: unknown) {
  return reply({error: error instanceof PublicError ? error.message : 'We could not complete that request. Please try again.'}, error instanceof PublicError ? error.status : 503);
}
