import {createHmac} from 'node:crypto';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {trustedRequest} from '@/lib/request-origin';
import {readSmallJson,validateSignup,jsonResponse} from '@/lib/kaguvi-signup';
export const dynamic='force-dynamic';

export async function POST(request:Request){
 if(!trustedRequest(request))return jsonResponse({error:'Please submit the form from the KaguviGo page.'},403);
 if(!request.headers.get('content-type')?.includes('application/json'))return jsonResponse({error:'Invalid request.'},415);
 let body;
 try{body=await readSmallJson(request);}catch(e){return jsonResponse({error:'Please check your details.'},(e as Error).message==='too_large'?413:400);}
 const result=validateSignup(body);
 if('spam' in result)return jsonResponse({ok:true},201);
 if(result.error)return jsonResponse({error:result.error},400);
 const interest=body.interest??'general';
 if(!['buyer','seller','runner','general'].includes(interest))return jsonResponse({error:'Choose Buyer, Seller or Runner.'},400);
 try{
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret)throw new Error('unconfigured');
  // Vercel supplies the client address. Keep only a rotating HMAC, never the IP.
  const ip=request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()||request.headers.get('x-real-ip')||'unknown';
  const bucket=createHmac('sha256',secret).update(`kaguvigo:${Math.floor(Date.now()/3600000)}:${ip}`).digest('hex');
  const {data,error}=await supabaseAdmin().rpc('capture_website_lead',{p_slug:'kaguvigo',p_name:result.data!.name,p_email:result.data!.email,p_phone:result.data!.phone,p_interest:interest,p_bucket:bucket});
  if(error)throw error;
  if(!data)return jsonResponse({error:'Too many attempts. Please try again in an hour.'},429);
  return jsonResponse({ok:true},201);
 }catch{return jsonResponse({error:'We couldn’t save your details just yet. Please try again.'},503);}
}
