import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {trustedRequest} from '@/lib/request-origin';
import {z} from 'zod';
const money=z.number().finite().min(0).max(100000000);
const line=z.object({description:z.string().trim().min(1).max(300),quantity:z.number().positive().max(100000),unit_price:money});
const frequency=z.enum(['monthly','weekly','fortnightly','daily']);
const paymentTerms=z.enum(['50_before_50_after','70_before_30_after','full_payment']);
const payload=z.object({lines:z.array(line).min(1).max(50).optional(),tax_rate:z.number().min(0).max(100).optional(),recurrence:z.enum(['none','monthly']).optional(),payment_terms:paymentTerms.optional(),description:z.string().max(5000).optional(),message:z.string().max(1600).optional(),audience:z.string().max(300).optional(),purpose:z.enum(['marketing','transactional']).optional(),base:money.optional(),allowances:money.optional(),overtime:money.optional(),allowable_deductions:money.optional(),tax_credit:money.optional(),other_deductions:money.optional(),employee:z.string().max(160).optional(),period_start:z.iso.date().optional(),period_end:z.iso.date().optional(),paid_from:z.iso.date().optional(),paid_to:z.iso.date().optional(),pay_date:z.iso.date().optional(),frequency:frequency.optional(),proration_basis:z.enum(['full','calendar_days','manual_units']).optional(),paid_units:z.number().finite().positive().max(10000).optional(),period_units:z.number().finite().positive().max(10000).optional(),proration_note:z.string().max(1000).optional(),request_id:z.uuid().optional()}).strict();
const create=z.object({kind:z.enum(['quote','invoice','payroll','request','sms']),title:z.string().trim().min(1).max(160),client_id:z.uuid().nullable(),currency:z.enum(['USD','ZWG','GBP','AUD']),due_date:z.iso.date().nullable(),payload});
const rule=z.object({verified:z.boolean(),valid_from:z.iso.date(),valid_to:z.iso.date(),source:z.string().min(5).max(500),nssa_rate:z.number().min(0).max(100),nssa_ceiling:money,aids_rate:z.number().min(0).max(100),frequency:frequency.default('monthly'),partial_period_verified:z.boolean().default(false),partial_period_note:z.string().max(1000).default(''),bands:z.array(z.object({from:money,rate:z.number().min(0).max(100),deduct:money})).min(1).max(30)}).refine(r=>r.valid_to>=r.valid_from&&r.bands[0].from===0&&r.bands.every((b,i)=>i===0||b.from>r.bands[i-1].from),'Dates and tax bands must be ordered, starting at zero');
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return NextResponse.json({error:'Forbidden'},{status:403});
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));if(!ctx?.workspace)return NextResponse.json({error:'Sign in required'},{status:401});
 const raw=await req.json().catch(()=>null);
 if(raw?.action==='remove_test_invoice'){
  const parsed=z.object({action:z.literal('remove_test_invoice'),id:z.uuid(),reason:z.string().trim().min(5).max(500)}).strict().safeParse(raw);
  if(!parsed.success)return NextResponse.json({error:'Choose an invoice and give a removal reason.'},{status:400});
  const {data,error}=await ctx.db.rpc('remove_test_invoice',{t:ctx.workspace.id,r:parsed.data.id,reason:parsed.data.reason});
  return NextResponse.json(error?{error:error.message}:data,{status:error?400:200});
 }
 if(raw?.action==='rules'){
  if(ctx.workspace.role!=='owner'&&!(ctx.workspace.permissions??[]).includes('payroll_admin'))return NextResponse.json({error:'Payroll administrator access required'},{status:403});
  const parsed=z.object({action:z.literal('rules'),rules:z.object({USD:rule.optional(),ZWG:rule.optional()}).strict()}).safeParse(raw);
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues.map(i=>i.message).join('; ')},{status:400});
  const {error}=await ctx.db.from('payroll_rules').upsert({tenant_id:ctx.workspace.id,rules:parsed.data.rules});
  return NextResponse.json(error?{error:error.message}:{ok:true},{status:error?400:200});
 }
 if(raw?.action){
  const parsed=z.object({id:z.uuid(),action:z.enum(['issue','convert','payment','close','finalise','recur']),amount:money.optional(),reference:z.string().trim().min(1).max(160).optional(),period:z.iso.date().optional()}).strict().safeParse(raw);
  if(!parsed.success)return NextResponse.json({error:'Invalid action details'},{status:400});
  const {data,error}=await ctx.db.rpc('business_action',{t:ctx.workspace.id,r:parsed.data.id,a:parsed.data.action,v:parsed.data});
  return NextResponse.json(error?{error:error.message}:data,{status:error?400:200});
 }
 const parsed=create.safeParse(raw);if(!parsed.success)return NextResponse.json({error:parsed.error.issues.map(i=>i.message).join('; ')},{status:400});
 const {data,error}=await ctx.db.rpc('create_business_item',{t:ctx.workspace.id,k:parsed.data.kind,v:parsed.data});
 return NextResponse.json(error?{error:error.message}:data,{status:error?400:201});
}
