import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {z} from 'zod';
const text=z.string().trim();
const schema=z.object({id:z.uuid().optional(),title:text.min(1).max(160),description:text.max(5000),url:z.union([z.url().refine(s=>/^https?:\/\//.test(s)),z.literal('')]),status:z.enum(['Not started','In progress','Under review','Complete']),assignee_id:z.uuid().nullable(),target_date:z.iso.date().nullable(),review_notes:text.max(5000)});
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client')return NextResponse.json({error:'Staff access required'},{status:403});
 const tables=['backoffice_builds','it_tickets','staff_directory'];
 const results=await Promise.all(tables.map(table=>c.db.from(table).select('*').eq('tenant_id',c.workspace!.id)));
 const out:Record<string,unknown>={};for(const [i,table] of tables.entries()){if(results[i].error)return NextResponse.json({error:'The back-office builds database upgrade is required.'},{status:400});out[table]=results[i].data??[];}
 return NextResponse.json(out,{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client'||!allowed(c.workspace.role,c.workspace.permissions??[],'tickets'))return NextResponse.json({error:'IT administrator access required'},{status:403});
 const p=schema.safeParse(await req.json().catch(()=>null));if(!p.success)return NextResponse.json({error:p.error.issues.map(i=>i.message).join('; ')},{status:400});
 const {id,...fields}=p.data;
 const r=id?await c.db.from('backoffice_builds').update(fields).eq('tenant_id',c.workspace.id).eq('id',id).select().single():await c.db.from('backoffice_builds').insert({...fields,tenant_id:c.workspace.id}).select().single();
 return NextResponse.json(r.error?{error:r.error.message}:r.data,{status:r.error?400:200});
}
