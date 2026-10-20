import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {z} from 'zod';
const text=z.string().trim();
const device=z.object({id:z.uuid().optional(),asset_tag:text.min(1).max(80),name:text.min(1).max(160),category:z.enum(['Laptop','Desktop','Phone','Tablet','Printer','Network','Other']),serial_number:text.max(160),model:text.max(160),location:text.max(160),assigned_to:z.uuid().nullable(),status:z.enum(['Available','Assigned','Under repair','Lost','Retired']),purchased_on:z.iso.date().nullable(),warranty_until:z.iso.date().nullable(),notes:text.max(5000)});
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client')return NextResponse.json({error:'Staff access required'},{status:403});
 const out:Record<string,unknown>={};
 const tables=['devices','device_history','staff_directory','it_tickets'];
 const results=await Promise.all(tables.map(table=>c.db.from(table).select('*').eq('tenant_id',c.workspace!.id)));
 for(const [i,table] of tables.entries()){
 const r=results[i];
 if(r.error)return NextResponse.json({error:'Run upgrade-device-register.sql after the operations and finance SQL updates.'},{status:400});out[table]=r.data??[];
 }
 return NextResponse.json(out,{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client'||!allowed(c.workspace.role,c.workspace.permissions??[],'tickets'))return NextResponse.json({error:'IT administrator access required'},{status:403});
 const p=device.safeParse(await req.json().catch(()=>null));if(!p.success)return NextResponse.json({error:p.error.issues.map(i=>i.message).join('; ')},{status:400});
 const {id,...fields}=p.data;
 const r=id?await c.db.from('devices').update(fields).eq('tenant_id',c.workspace.id).eq('id',id).select().single():await c.db.from('devices').insert({...fields,tenant_id:c.workspace.id}).select().single();
 return NextResponse.json(r.error?{error:r.error.message}:r.data,{status:r.error?400:200});
}
