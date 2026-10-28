import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/context';
import {canDeleteRecords} from '@/lib/delete-access';
import {trustedRequest} from '@/lib/request-origin';
import {z} from 'zod';
const kinds=['invoice','quote','clients','projects','tasks','it_tickets','request','sms'] as const;
const reply=(b:unknown,s=200)=>NextResponse.json(b,{status:s,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||!canDeleteRecords(c.user.email,c.workspace.role))return reply({error:'Only nyasha@nxt-workforce.com can remove records.'},403);
 const kind=z.enum(kinds).safeParse(req.nextUrl.searchParams.get('kind'));if(!kind.success)return reply({error:'Choose a record type.'},400);
 const business=['invoice','quote','request','sms'].includes(kind.data);
 let q=c.db.from(business?'business_items':kind.data).select(business?'id,reference,title,status,total,paid':'id,title,status').eq('tenant_id',c.workspace.id);
 q=business?q.eq('kind',kind.data).is('deleted_at',null):q.is('archived_at',null);
 const r=await q.order('created_at',{ascending:false}).limit(500);
 return reply(r.error?{error:'Records could not load.'}:{records:r.data},r.error?503:200);
}
export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Open the portal directly and retry.'},403);
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||!canDeleteRecords(c.user.email,c.workspace.role))return reply({error:'Only nyasha@nxt-workforce.com can remove records.'},403);
 const p=z.object({kind:z.enum(kinds),id:z.uuid(),reason:z.string().trim().min(5).max(500)}).safeParse(await req.json().catch(()=>null));
 if(!p.success)return reply({error:'Choose a record and give a reason of 5-500 characters.'},400);
 const r=await c.db.rpc('remove_test_record',{t:c.workspace.id,k:p.data.kind,r:p.data.id,reason:p.data.reason});
 return reply(r.error?{error:r.error.message}:{ok:true},r.error?400:200);
}
