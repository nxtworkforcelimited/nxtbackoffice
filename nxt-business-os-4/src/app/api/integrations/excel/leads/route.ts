import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {spreadsheetText} from '@/lib/lead-export';
import {readSmallJson,jsonResponse} from '@/lib/kaguvi-signup';
export const dynamic='force-dynamic';
function authorized(req:Request){const token=process.env.LEADS_EXCEL_SYNC_TOKEN;if(!token||token.length<32)return false;const actual=Buffer.from(req.headers.get('authorization')??''),expected=Buffer.from(`Bearer ${token}`);return actual.length===expected.length&&timingSafeEqual(actual,expected);}
// Pull and acknowledge contract for a scheduled Power Automate flow. No public contact reads.
export async function GET(req:Request){
 if(!authorized(req))return jsonResponse({error:'Unauthorized'},401);
 try{
  const {data,error}=await supabaseAdmin().from('website_leads').select('id,name,phone,email,interest,source,status,created_at,consented_at').eq('form_slug','kaguvigo').is('excel_synced_at',null).order('created_at').order('id').limit(50);
  if(error)throw error;
  return jsonResponse({leads:data.map(r=>({LeadID:r.id,Business:'KaguviGo',Name:spreadsheetText(r.name),Phone:spreadsheetText(r.phone),Email:spreadsheetText(r.email),Interest:r.interest,Source:r.source,Status:r.status,CreatedAt:r.created_at,ConsentedAt:r.consented_at}))});
 }catch{return jsonResponse({error:'Leads temporarily unavailable.'},503);}
}
export async function POST(req:Request){
 if(!authorized(req))return jsonResponse({error:'Unauthorized'},401);
 try{
  const p=z.object({lead_ids:z.array(z.uuid()).min(1).max(50)}).parse(await readSmallJson(req));
  const {error}=await supabaseAdmin().from('website_leads').update({excel_synced_at:new Date().toISOString()}).eq('form_slug','kaguvigo').in('id',p.lead_ids).is('excel_synced_at',null);
  if(error)throw error;return jsonResponse({ok:true});
 }catch{return jsonResponse({error:'Acknowledgement failed.'},400);}
}
