import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {z} from 'zod';
const text=z.string().trim().max(300),date=z.iso.date(),id=z.uuid();
const employee=z.object({action:z.literal('employee'),id:id.optional(),name:text.min(1),email:z.union([z.email(),z.literal('')]),phone:text,job_title:text,birth_date:date.nullable(),start_date:date.nullable(),bank_name:text,account_name:text,account_number:text,branch:text,user_id:id.nullable(),status:z.enum(['active','inactive'])});
const schema=z.discriminatedUnion('action',[employee,
 z.object({action:z.literal('salary'),employee_id:id,currency:z.enum(['USD','ZWG','GBP','AUD']),monthly_gross:z.number().min(0).max(100000000),effective_date:date}),
 z.object({action:z.literal('leave'),kind:z.enum(['Annual','Sick','Family','Unpaid','Other']),starts:date,ends:date,reason:z.string().trim().min(1).max(3000)}),
 z.object({action:z.literal('review'),id,decision:z.enum(['approved','rejected','cancelled']),note:z.string().max(3000)}),
 z.object({action:z.literal('message'),client_id:id,body:z.string().trim().min(1).max(5000)}),
 z.object({action:z.literal('file'),employee_id:id,name:text.min(1).max(200),category:z.enum(['CV','ID','Contract','Other'])})]);
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace)return NextResponse.json({error:'Sign in required'},{status:401});
 const area=req.nextUrl.searchParams.get('area');
 const tables=area==='messages'?['portal_messages']:area==='leave'?['leave_requests']:area==='employees'?['employees','employee_salaries','employee_files']:[];
 if(!tables.length)return NextResponse.json({error:'Invalid area'},{status:400});
 const output:Record<string,unknown>={user_id:c.user.id};
 for(const table of tables){const {data,error}=await c.db.from(table).select('*').eq('tenant_id',c.workspace.id).order('created_at');if(error)return NextResponse.json({error:'Run the People and Messages migration before using this area.'},{status:400});output[table]=data;}
 if(area==='employees')output.employee_files=await Promise.all((output.employee_files as any[]).map(async f=>{const r=await c.db.storage.from('employee-files').createSignedUrl(f.object_path,120);return {...f,url:r.data?.signedUrl??null};}));
 return NextResponse.json(output,{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const c=await context(req.nextUrl.searchParams.get('workspace'));if(!c?.workspace)return NextResponse.json({error:'Sign in required'},{status:401});
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues.map(i=>i.message).join('; ')},{status:400});
 const {action,...v}=parsed.data as any;let result;
 if(action==='review')result=await c.db.rpc('review_leave',{t:c.workspace.id,r:v.id,decision:v.decision,note:v.note});
 else if(action==='employee'&&v.id){const key=v.id;delete v.id;result=await c.db.from('employees').update(v).eq('tenant_id',c.workspace.id).eq('id',key).select().single();}
 else {const table={employee:'employees',salary:'employee_salaries',leave:'leave_requests',message:'portal_messages',file:'employee_files'}[action as string];if(!table)return NextResponse.json({error:'Invalid action'},{status:400});
 if(action==='leave')v.requester_email=c.user.email??'';
 if(action==='file'){v.id=crypto.randomUUID();v.object_path=`${c.workspace.id}/${v.id}`;}
 result=await c.db.from(table).insert({...v,tenant_id:c.workspace.id}).select().single();}
 return NextResponse.json(result.error?{error:result.error.message}:result.data,{status:result.error?400:200});
}
