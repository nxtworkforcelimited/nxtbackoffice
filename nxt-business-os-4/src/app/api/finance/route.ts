import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {z} from 'zod';
import {chart} from '@/lib/accounting';
const id=z.uuid(),currency=z.enum(['USD','ZWG','GBP','AUD']),money=z.number().finite().min(0).max(100000000).refine(n=>Math.abs(n*100-Math.round(n*100))<0.00001,'Use two decimal places');
const save=z.object({action:z.literal('save'),id:id.optional(),kind:z.enum(['expense','purchase_order','subscription']),title:z.string().trim().min(1,'Enter an expense, purchase order or subscription title').max(160),vendor:z.string().trim().max(300),description:z.string().max(5000),currency,amount:money,due_date:z.iso.date().nullable(),status:z.enum(['draft','active','free_trial','cancelled']),order_lines:z.array(z.object({description:z.string().trim().min(1,'Enter a description for each purchase order item').max(300),quantity:z.number().finite().positive().max(100000),unit_price:money})).max(50).default([]),billing_cycle:z.enum(['weekly','monthly','quarterly','yearly','once'])}).strict();
const transition=z.object({action:z.literal('status'),id,status:z.enum(['approved','paid','cancelled','issued','received'])}).strict();
const journal=z.object({action:z.literal('journal'),entry_date:z.iso.date(),currency,description:z.string().trim().min(1).max(300),lines:z.array(z.object({account:z.string().refine(v=>chart.some(a=>a.code===v),'Unknown account'),debit:money,credit:money}).strict()).min(2).max(100)}).strict();
export async function GET(req:NextRequest){const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client')return NextResponse.json({error:'Staff access required'},{status:403});
 const results=await Promise.all(['finance_records','accounting_journals'].map(t=>c.db.from(t).select('*').eq('tenant_id',c.workspace!.id).order('created_at',{ascending:false})));
 if(results.some(r=>r.error))return NextResponse.json({error:'Install upgrade-finance-access.sql before opening Finance.'},{status:400});
 return NextResponse.json({records:results[0].data,journals:results[1].data},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest){if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client')return NextResponse.json({error:'Staff access required'},{status:403});
 const parsed=z.discriminatedUnion('action',[save,transition,journal]).safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues.map(i=>[i.path.join('.'),i.message].filter(Boolean).join(': ')).join('; ')},{status:400});const {action,...v}=parsed.data;let r;
 if(action==='journal'){const j=v as Omit<z.infer<typeof journal>,'action'>;if(j.currency!=='USD')return NextResponse.json({error:'Accounting uses USD only'},{status:400});r=await c.db.from('accounting_drafts').insert({entry_date:j.entry_date,description:j.description,lines:j.lines,reference:crypto.randomUUID(),tenant_id:c.workspace.id}).select().single();}
 else if(action==='status'){const {id,...f}=v as z.infer<typeof transition>;r=await c.db.from('finance_records').update(f).eq('tenant_id',c.workspace.id).eq('id',id).select().single();}
 else {const {id,...f}=v as Omit<z.infer<typeof save>,'action'>;r=id?await c.db.from('finance_records').update(f).eq('tenant_id',c.workspace.id).eq('id',id).select().single():await c.db.from('finance_records').insert({...f,tenant_id:c.workspace.id}).select().single();}
 return NextResponse.json(r.error?{error:r.error.message}:r.data,{status:r.error?400:200});
}
