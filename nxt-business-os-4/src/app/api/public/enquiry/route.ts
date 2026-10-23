import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
const schema=z.object({type:z.enum(['enquiry','free_audit']),name:z.string().trim().min(2).max(120),company:z.string().trim().max(160).optional().default(''),email:z.email().max(254),phone:z.string().trim().max(60).optional().default(''),service:z.string().trim().max(160).optional().default(''),industry:z.string().trim().max(160).optional().default(''),audit_type:z.string().trim().max(160).optional().default(''),message:z.string().trim().min(2).max(4000),website:z.string().max(0).optional().default('')}).strict();
export async function POST(req:NextRequest){
 const origin=req.headers.get('origin');if(origin&&origin!==req.nextUrl.origin)return NextResponse.json({error:'Forbidden'},{status:403});
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid enquiry'},{status:400});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return NextResponse.json({error:'Website forms are not configured'},{status:503});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const slug=process.env.NXT_WORKSPACE_SLUG||'nxt-workforce';
 const {data:tenant,error:tenantError}=await db.from('tenants').select('id').eq('slug',slug).maybeSingle();
 if(tenantError||!tenant)return NextResponse.json({error:'Workspace is not configured'},{status:503});
 const v=parsed.data;
 const {data:enquiry,error}=await db.from('website_enquiries').insert({tenant_id:tenant.id,enquiry_type:v.type,name:v.name,company:v.company||null,email:v.email,phone:v.phone||null,service:v.service||null,industry:v.industry||null,audit_type:v.audit_type||null,message:v.message,source:'website'}).select('id').single();
 if(error)return NextResponse.json({error:'Could not save enquiry'},{status:500});
 const title=v.type==='free_audit'?'Free Audit Request':'NXT Website Enquiry';
 const description=[v.company&&'Company: '+v.company,'Email: '+v.email,v.phone&&'Phone: '+v.phone,v.service&&'Service: '+v.service,v.industry&&'Industry: '+v.industry,v.audit_type&&'Audit: '+v.audit_type,'Message: '+v.message].filter(Boolean).join('\n');
 await db.from('deals').insert({tenant_id:tenant.id,title:title+' - '+v.name,description,status:'new',client_visible:false,amount:0,currency:'USD'});
 return NextResponse.json({ok:true,id:enquiry.id},{status:201});
}
