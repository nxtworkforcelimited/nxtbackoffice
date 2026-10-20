import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {z} from 'zod';
const money=z.number().finite().min(0).max(100000000);
const line=z.object({description:z.string().trim().min(1).max(300),quantity:z.number().positive().max(100000),unit_price:money});
const payload=z.object({lines:z.array(line).min(1).max(50).optional(),tax_rate:z.number().min(0).max(100).optional(),recurrence:z.enum(['none','monthly']).optional(),description:z.string().max(5000).optional(),message:z.string().max(1600).optional(),audience:z.string().max(300).optional(),purpose:z.enum(['marketing','transactional']).optional(),base:money.optional(),allowances:money.optional(),overtime:money.optional(),allowable_deductions:money.optional(),tax_credit:money.optional(),other_deductions:money.optional(),employee:z.string().max(160).optional()}).strict();
const create=z.object({kind:z.enum(['quote','invoice','payroll','request','sms']),title:z.string().trim().min(1).max(160),client_id:z.uuid().nullable(),currency:z.enum(['USD','ZWG','GBP','AUD']),due_date:z.iso.date().nullable(),payload});
const rule=z.object({verified:z.boolean(),valid_from:z.iso.date(),valid_to:z.iso.date(),source:z.string().min(5).max(500),nssa_rate:z.number().min(0).max(100),nssa_ceiling:money,aids_rate:z.number().min(0).max(100),bands:z.array(z.object({from:money,rate:z.number().min(0).max(100),deduct:money})).min(1).max(30)}).refine(r=>r.valid_to>=r.valid_from&&r.bands[0].from===0&&r.bands.every((b,i)=>i===0||b.from>r.bands[i-1].from),'Dates and tax bands must be ordered, starting at zero');
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const ctx=await context(req.nextUrl.searchParams.get('workspace'));if(!ctx?.workspace)return NextResponse.json({error:'Sign in required'},{status:401});
 const raw=await req.json().catch(()=>null);
 if(raw?.action==='rules'){
  if(ctx.workspace.role!=='owner')return NextResponse.json({error:'Owner access required'},{status:403});
  const parsed=z.object({action:z.literal('rules'),rules:z.object({USD:rule.optional(),ZWG:rule.optional()}).strict()}).safeParse(raw);
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues.map(i=>i.message).join('; ')},{status:400});
  const {error}=await ctx.db.from('payroll_rules').upsert({tenant_id:ctx.workspace.id,rules:parsed.data.rules});
  return NextResponse.json(error?{error:'Could not save payroll rules'}:{ok:true},{status:error?400:200});
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
