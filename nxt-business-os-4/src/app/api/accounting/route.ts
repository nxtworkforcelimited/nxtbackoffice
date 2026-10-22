import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {z} from 'zod';
import {chart} from '@/lib/accounting';
const line=z.object({account:z.string().refine(v=>chart.some(a=>a.code===v)),debit:z.number().finite().nonnegative().max(100000000),credit:z.number().finite().nonnegative().max(100000000)}).strict();
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client'||!c.workspace.permissions?.includes('finance')&&!['owner','admin'].includes(c.workspace.role))return NextResponse.json({error:'Finance access required'},{status:403});
 const tables=['accounting_drafts','accounting_reviewers','accounting_journals','business_items','audit_events'];
 const rows=await Promise.all(tables.map(async t=>{
  const data: Record<string,unknown>[]=[];
  for(let offset=0;offset<100000;offset+=1000){
   const r=await c.db.from(t).select('*').eq('tenant_id',c.workspace!.id).order(t==='accounting_reviewers'?'user_id':'id',{ascending:true}).range(offset,offset+999);
   if(r.error)return {data:null,error:r.error};
   data.push(...r.data);if(r.data.length<1000)return {data,error:null};
  }
  return {data:null,error:{message:'Too many records to report safely. Narrow the reporting scope.'}};
 }));
 const failed=rows.find(r=>r.error);if(failed)return NextResponse.json({error:failed.error?.message},{status:400});
 return NextResponse.json({drafts:rows[0].data,reviewers:rows[1].data,journals:rows[2].data,invoices:rows[3].data?.filter(v=>v.kind==='invoice'&&v.currency==='USD'),audit:rows[4].data,user_id:c.user.id},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace||c.workspace.role==='client')return NextResponse.json({error:'Staff access required'},{status:403});
 const schema=z.discriminatedUnion('action',[z.object({action:z.literal('save'),id:z.uuid().optional(),entry_date:z.iso.date(),description:z.string().trim().min(1).max(300),lines:z.array(line).min(2).max(100)}).strict(),z.object({action:z.enum(['approve','post']),id:z.uuid()}).strict()]);
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues.map(i=>i.message).join('; ')},{status:400});
 const v=parsed.data;let r;
 if(v.action==='save'){const {id,action,...fields}=v;void action;r=id?await c.db.from('accounting_drafts').update(fields).eq('tenant_id',c.workspace.id).eq('id',id).eq('status','draft').select().single():await c.db.from('accounting_drafts').insert({...fields,tenant_id:c.workspace.id,reference:crypto.randomUUID()}).select().single();}
 else r=await c.db.rpc('accounting_review',{p_tenant:c.workspace.id,p_id:v.id,p_action:v.action});
 return NextResponse.json(r.error?{error:r.error.message}:r.data,{status:r.error?400:200});
}
