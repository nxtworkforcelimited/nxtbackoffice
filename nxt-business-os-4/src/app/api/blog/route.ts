import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {context} from '@/lib/context';
import {allowed} from '@/lib/business';
import {trustedRequest} from '@/lib/request-origin';
import {publishBlockers,validSlug} from '@/lib/blog';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});

const text=(n:number)=>z.string().trim().max(n);
const https=z.union([z.literal(''),z.string().trim().regex(/^https:\/\/[^\s]+$/).max(500)]);
const postInput=z.object({
 action:z.literal('save').optional(),
 id:z.uuid().optional(),client_id:z.uuid().nullable().default(null),
 title:text(160).min(1),slug:text(90).refine(validSlug,'Use lowercase letters, numbers and single hyphens only.'),
 h1:text(160).default(''),excerpt:text(400).default(''),body:z.string().max(100000).default(''),
 focus_keyword:text(80).default(''),hero_path:text(500).nullable().default(null),hero_alt:text(200).default(''),og_image_path:text(500).nullable().default(null),
 meta_title:text(120).default(''),meta_description:text(320).default(''),canonical_url:https.default(''),
 category:text(60).default(''),tags:z.array(text(40).min(1)).max(15).default([]),author_name:text(100).default(''),
 publish_at:z.iso.datetime({offset:true}).nullable().default(null)
}).strict();
const statusInput=z.object({action:z.literal('status'),id:z.uuid(),status:z.enum(['draft','review','published','archived'])}).strict();

export async function GET(req:NextRequest){
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client')return reply({error:'Staff access required.'},403);
 const perms=c.workspace.permissions??[];
 if(!allowed(c.workspace.role,perms,'content'))return reply({error:'Content access required.'},403);
 const [posts,clients]=await Promise.all([
  c.db.from('blog_posts').select('*').eq('tenant_id',c.workspace.id).order('updated_at',{ascending:false}).limit(500),
  c.db.from('clients').select('id,title').eq('tenant_id',c.workspace.id).is('archived_at',null).order('title')
 ]);
 if(posts.error)return reply({error:'The blog database upgrade (202611090008) has not been applied yet.'},400);
 let site='';
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(url&&key){const a=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});site=(await a.from('tenants').select('slug').eq('id',c.workspace.id).maybeSingle()).data?.slug??'';}
 return reply({posts:posts.data??[],clients:clients.data??[],can_publish:allowed(c.workspace.role,perms,'approve_content'),site,images_base:url?url.replace(/\/+$/,'')+'/storage/v1/object/public/blog-images/':''});
}

export async function POST(req:NextRequest){
 if(!trustedRequest(req))return reply({error:'Open the back office directly and retry.'},403);
 const c=await context(req.nextUrl.searchParams.get('workspace'));
 if(!c?.workspace||c.workspace.role==='client')return reply({error:'Staff access required.'},403);
 const perms=c.workspace.permissions??[],role=c.workspace.role,tenant=c.workspace.id;
 if(!allowed(role,perms,'content'))return reply({error:'Content access required.'},403);
 const canPublish=allowed(role,perms,'approve_content');
 const raw=await req.json().catch(()=>null);
 const mine=(p:string|null)=>p===null||p.startsWith(tenant+'/');

 if(raw?.action==='status'){
  const s=statusInput.safeParse(raw);if(!s.success)return reply({error:'Choose a post and a status.'},400);
  const cur=await c.db.from('blog_posts').select('*').eq('tenant_id',tenant).eq('id',s.data.id).maybeSingle();
  if(!cur.data)return reply({error:'Post not found.'},404);
  const from=cur.data.status as string,to=s.data.status;
  if(to==='published'||from==='published'){
   if(!canPublish)return reply({error:'Publishing, unpublishing and changing live posts needs approval permission. Send the post for review instead.'},403);
  }
  if(to==='published'){
   const blockers=publishBlockers(cur.data);
   if(blockers.length)return reply({error:'Fix these before publishing: '+blockers.join(' '),blockers},400);
  }
  // Posts are archived, never deleted. Archiving a live post unpublishes it.
  const out=await c.db.from('blog_posts').update({status:to}).eq('tenant_id',tenant).eq('id',s.data.id).select().single();
  return out.error?reply({error:/approval permission/.test(out.error.message)?out.error.message:'The status could not be changed.'},400):reply(out.data);
 }

 const p=postInput.safeParse(raw);
 if(!p.success)return reply({error:p.error.issues.map(i=>(i.path[0]?String(i.path[0]).replace(/_/g,' ')+': ':'')+i.message).join('; ')},400);
 const {id,...fields}=p.data;delete (fields as {action?:unknown}).action;
 if(!mine(fields.hero_path)||!mine(fields.og_image_path))return reply({error:'Images must be uploaded from the blog editor.'},400);
 if(fields.client_id){
  const k=await c.db.from('clients').select('id').eq('tenant_id',tenant).eq('id',fields.client_id).maybeSingle();
  if(!k.data)return reply({error:'That client was not found.'},404);
 }
 const row={...fields,tags:[...new Set(fields.tags)]};
 const out=id
  ?await c.db.from('blog_posts').update(row).eq('tenant_id',tenant).eq('id',id).select().single()
  :await c.db.from('blog_posts').insert({...row,tenant_id:tenant,created_by:c.user.id}).select().single();
 if(out.error){
  if(out.error.code==='23505')return reply({error:'Another post already uses that URL slug. Choose a different one.'},409);
  if(/approval permission/.test(out.error.message))return reply({error:'This post is live. Changing it needs approval permission.'},403);
  return reply({error:'The post could not be saved.'},400);
 }
 return reply(out.data,id?200:201);
}
