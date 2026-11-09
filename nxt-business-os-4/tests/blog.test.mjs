import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const read=f=>readFile(new URL('../'+f,import.meta.url),'utf8');
const B=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(await read('src/lib/blog.ts'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));

test('slugs are clean, short and safe',()=>{
 assert.equal(B.slugify('Why Your Business Needs a Website in 2026!'),'why-your-business-needs-a-website-in-2026');
 assert.equal(B.slugify("Café & Bar: Zimbabwe's Best"),'cafe-and-bar-zimbabwes-best');
 assert.equal(B.slugify('  ---  '),'');assert.equal(B.slugify('../../etc/passwd'),'etc-passwd');
 const long=B.slugify('word '.repeat(60));assert.ok(long.length<=70&&!long.endsWith('-'));
 assert.ok(B.validSlug('a-b-1')&&!B.validSlug('A-b')&&!B.validSlug('a--b')&&!B.validSlug('-a')&&!B.validSlug(''));
});
test('markdown becomes headings, lists, quotes, images and links',()=>{
 const h=B.renderMarkdown('## Why it matters\n\nSome **bold** and *italic* text with a [link](https://example.com).\n\n### A detail\n\n- one\n- two\n\n1. first\n2. second\n\n> quote\n\n![A red van](https://x.com/v.png "Our van")');
 for(const frag of ['<h2 id="why-it-matters">','<h3 id="a-detail">','<strong>bold</strong>','<em>italic</em>','<a href="https://example.com" rel="noopener noreferrer" target="_blank">link</a>','<ul><li>one</li><li>two</li></ul>','<ol><li>first</li><li>second</li></ol>','<blockquote>','<figure><img src="https://x.com/v.png" alt="A red van" loading="lazy"><figcaption>Our van</figcaption></figure>'])assert.ok(h.includes(frag),frag);
});
test('post text can never inject scripts or unsafe links',()=>{
 const h=B.renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) [y](data:text/html;base64,AAA) ![z](javascript:alert(2)) ![a" onerror="alert(3)](https://x.com/a.png)\n\n## <img src=x onerror=alert(4)>\n\n[ok](/relative) [mail](mailto:a@b.co)');
 assert.ok(!/<script/i.test(h));assert.ok(!/javascript:/i.test(h));assert.ok(!/data:text/i.test(h));
 assert.ok(h.includes('alt="a&quot; onerror=&quot;alert(3)"'),'quotes in alt text are escaped, so no attribute can be injected');
 assert.ok(!/<img src=x/i.test(h));assert.ok(h.includes('href="/relative"'));assert.ok(h.includes('mailto:a@b.co'));
 assert.ok(h.includes('&lt;script&gt;'));
});
test('outline lists H2 and H3 with unique anchors; a stray H1 in the body counts as H2',()=>{
 const o=B.outline('# Oops\n\n## Same\n\n### Same\n\n## Same');
 assert.deepEqual(o.map(x=>[x.level,x.id]),[[2,'oops'],[2,'same'],[3,'same-2'],[2,'same-3']]);
 assert.equal(B.bodyHasH1('# Oops'),true);assert.equal(B.bodyHasH1('## Fine\n#hashtag'),false);
 assert.ok(B.renderMarkdown('# Oops').startsWith('<h2'));
});
const good={title:'Why Your Business Needs a Website in Zimbabwe',slug:'business-website-zimbabwe',h1:'',excerpt:'Short summary.',body:('## Why a website matters\n\nA business website in Zimbabwe helps customers find you. '+'word '.repeat(150)+'\n\n### Trust\n\nSee [our services](/services).\n\n## Next steps\n\n'+'text '.repeat(100)),focus_keyword:'business website',hero_path:'t/h.png',hero_alt:'A shop owner at a laptop',og_image_path:null,meta_title:'Business Website in Zimbabwe: Why You Need One',meta_description:'Learn why every business website in Zimbabwe wins customers, builds trust and works around the clock for you. Start with these steps.',canonical_url:''};
const st=(c,k)=>c.find(x=>x.key===k).state;
test('a well built post scores high with no failures',()=>{
 const c=B.analyzePost(good);assert.equal(c.filter(x=>x.state==='fail').length,0,JSON.stringify(c.filter(x=>x.state!=='pass')));
 assert.ok(B.seoScore(c)>=90,String(B.seoScore(c)));assert.deepEqual(B.publishBlockers(good),[]);
});
test('problems are found and explained',()=>{
 const bad={...good,title:'Hi',meta_title:'',meta_description:'',body:'### Early\n\n# Second H1\n\n![Describe this image](https://x.com/a.png)\n\nshort',hero_alt:'',slug:'Bad Slug',canonical_url:'http://x.com'};
 const c=B.analyzePost(bad);
 for(const k of ['title','description','body_h1','order','words','slug','hero','alt','canonical'])assert.equal(st(c,k),'fail',k);
 const blockers=B.publishBlockers(bad).join(' ');
 for(const frag of ['meta description','alt text','extra H1','URL slug','https'])assert.match(blockers,new RegExp(frag,'i'),frag);
});
test('focus keyword checks look in the right places',()=>{
 const c=B.analyzePost({...good,focus_keyword:'solar panels'});
 for(const k of ['kw_title','kw_h1','kw_slug','kw_desc','kw_intro','kw_sub'])assert.equal(st(c,k),'warn',k);
 assert.equal(st(B.analyzePost({...good,focus_keyword:''}),'keyword'),'warn');
});
test('search preview cuts like Google',()=>{
 const s=B.snippet('x '.repeat(50),'word '.repeat(60));assert.ok(s.title.length<=60&&s.title.endsWith('…'));assert.ok(s.description.length<=160);
});
test('public feed and hosted page: published only, no staff data, safe output',async()=>{
 const lib=await read('src/lib/server/blog-public.ts'),feed=await read('src/app/api/public/blog/route.ts'),one=await read('src/app/api/public/blog/[slug]/route.ts'),page=await read('src/app/blog/[site]/[slug]/page.tsx');
 assert.match(lib,/eq\('status','published'\)/);assert.match(lib,/publish_at\.lte\./,'scheduled posts stay hidden until their time');
 assert.doesNotMatch(lib,/created_by|updated_by|focus_keyword|status:/,'no staff fields leave the server');
 for(const s of [feed,one]){assert.match(s,/Access-Control-Allow-Origin/);assert.doesNotMatch(s,/\.insert\(|\.update\(|\.delete\(|POST/,'read only');}
 assert.match(page,/application\/ld\+json/);assert.match(page,/replace\(\/<\/g/,'JSON-LD cannot close its own script tag');assert.match(page,/canonical/);
});
test('staff blog route: content capability, publish needs approval, archive not delete, own images only',async()=>{
 const r=await read('src/app/api/blog/route.ts');
 assert.match(r,/'content'/);assert.match(r,/approve_content/);assert.match(r,/trustedRequest/);assert.doesNotMatch(r,/\.delete\(\)/);
 assert.match(r,/startsWith\(tenant\+'\/'\)/);assert.match(r,/publishBlockers\(cur\.data\)/);
});

test('database: writers draft, approvers publish, one address per site, nothing deleted, images only into your own folder',async t=>{
 const db=new PGlite(),uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 await db.exec(`create role service_role;create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,deleted_at timestamptz,email_confirmed_at timestamptz default now(),banned_until timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public,storage to authenticated;grant execute on function auth.uid() to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;`);
 const mig=f=>readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8');
 await db.exec((await mig('202610140001_foundation.sql')).replace('create extension if not exists pgcrypto;',''));
 await db.exec(await mig('202610160001_business_workspace.sql'));
 await db.exec('alter table member_permissions drop constraint if exists member_permissions_capability_check');
 const sql=await mig('202611090008_blog.sql');await db.exec(sql);await db.exec(sql);
 const E=(n,e)=>`('${uuid(n)}','${e}')`;
 await db.exec(`insert into auth.users(id,email) values ${[E(1,'owner@x.test'),E(2,'writer@x.test'),E(3,'approver@x.test'),E(4,'plain@x.test'),E(5,'other@x.test')].join(',')};
 insert into tenants(id,name,slug) values('${uuid(10)}','A','a'),('${uuid(11)}','B','b');
 insert into memberships(tenant_id,user_id,role,client_id) values('${uuid(10)}','${uuid(1)}','owner',null),('${uuid(10)}','${uuid(2)}','staff',null),('${uuid(10)}','${uuid(3)}','staff',null),('${uuid(10)}','${uuid(4)}','staff',null),('${uuid(11)}','${uuid(5)}','owner',null);
 insert into member_permissions(tenant_id,user_id,capability) values('${uuid(10)}','${uuid(2)}','content'),('${uuid(10)}','${uuid(3)}','content'),('${uuid(10)}','${uuid(3)}','approve_content');`);
 const as=async n=>{await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uuid(n)}',false);`);};
 const ins=(n,slug,status='draft',extra='')=>db.query(`insert into blog_posts(tenant_id,title,slug,status,created_by${extra?',':''}${extra.split('=')[0]||''}) values('${uuid(10)}','T','${slug}','${status}','${uuid(n)}'${extra?",'"+extra.split('=')[1]+"'":''}) returning id`);
 let id;
 await t.test('a writer can draft but not publish',async()=>{
  await as(2);id=(await ins(2,'first-post')).rows[0].id;
  await assert.rejects(ins(2,'sneaky','published'),/Publishing needs approval/);
  await assert.rejects(db.query(`update blog_posts set status='published' where id='${id}'`),/Publishing needs approval/);
  await db.query(`update blog_posts set status='review' where id='${id}'`);
 });
 await t.test('an approver publishes once, and the first publish time is kept',async()=>{
  await as(3);await db.query(`update blog_posts set status='published' where id='${id}'`);
  const first=(await db.query(`select published_at from blog_posts where id='${id}'`)).rows[0].published_at;assert.ok(first);
  await db.query(`update blog_posts set title='T2',published_at=now()+interval '1 day' where id='${id}'`);
  assert.equal((await db.query(`select published_at from blog_posts where id='${id}'`)).rows[0].published_at.getTime(),first.getTime());
 });
 await t.test('a writer cannot rewrite or unpublish a live post',async()=>{
  await as(2);
  await assert.rejects(db.query(`update blog_posts set body='changed' where id='${id}'`),/live post needs approval/);
  await assert.rejects(db.query(`update blog_posts set status='draft' where id='${id}'`),/Unpublishing needs approval/);
 });
 await t.test('people without the content permission, and other workspaces, see nothing',async()=>{
  await as(4);assert.equal((await db.query('select 1 from blog_posts')).rows.length,0);
  await assert.rejects(ins(4,'nope'),/row-level security/i);
  await as(5);assert.equal((await db.query('select 1 from blog_posts')).rows.length,0);
 });
 await t.test('one address per site; the same address is fine on another site',async()=>{
  await as(2);await assert.rejects(ins(2,'first-post'),/duplicate key|unique/i);
  await db.exec('reset role');await db.exec(`insert into clients(id,tenant_id,title) values('${uuid(20)}','${uuid(10)}','C')`);
  await as(2);await db.query(`insert into blog_posts(tenant_id,client_id,title,slug,created_by) values('${uuid(10)}','${uuid(20)}','T','first-post','${uuid(2)}')`);
 });
 await t.test('posts cannot be deleted, bad slugs and non-https canonicals are refused',async()=>{
  await as(3);await assert.rejects(db.query(`delete from blog_posts where id='${id}'`),/permission denied/i);
  await assert.rejects(ins(3,'Bad Slug'),/check/i);
  await assert.rejects(db.query(`insert into blog_posts(tenant_id,title,slug,canonical_url,created_by) values('${uuid(10)}','T','ok-slug','http://x.com','${uuid(3)}')`),/check/i);
 });
 await t.test('images can be uploaded only into your own workspace folder by content staff',async()=>{
  await as(2);await db.query(`insert into storage.objects(bucket_id,name) values('blog-images','${uuid(10)}/a.png')`);
  await assert.rejects(db.query(`insert into storage.objects(bucket_id,name) values('blog-images','${uuid(11)}/a.png')`),/row-level security/i);
  await as(4);await assert.rejects(db.query(`insert into storage.objects(bucket_id,name) values('blog-images','${uuid(10)}/b.png')`),/row-level security/i);
 });
});
