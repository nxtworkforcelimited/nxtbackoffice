begin;
create table if not exists public.website_pages (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 slug text not null check(length(slug) between 1 and 160),
 title text not null check(length(title) between 1 and 200),
 description text not null default '' check(length(description)<=500),
 content jsonb not null default '{}'::jsonb,
 status text not null default 'draft' check(status in ('draft','published')),
 updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,slug)
);
alter table public.website_pages enable row level security;
create policy website_pages_public_read on public.website_pages for select to anon using(status='published');
create policy website_pages_member_read on public.website_pages for select to authenticated using(status='published' or public.is_staff(tenant_id));
create policy website_pages_insert on public.website_pages for insert to authenticated with check(public.is_staff(tenant_id));
create policy website_pages_update on public.website_pages for update to authenticated using(public.is_staff(tenant_id)) with check(public.is_staff(tenant_id));

create table if not exists public.website_enquiries (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 enquiry_type text not null check(enquiry_type in ('enquiry','free_audit')),
 name text not null check(length(name) between 2 and 120),
 company text,
 email text not null,
 phone text,
 service text,
 industry text,
 audit_type text,
 message text not null check(length(message)<=4000),
 source text not null default 'website',
 status text not null default 'new' check(status in ('new','contacted','closed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.website_enquiries enable row level security;
create index if not exists website_enquiries_tenant_created_idx on public.website_enquiries(tenant_id,created_at desc);
create policy website_enquiries_read on public.website_enquiries for select to authenticated using(public.is_staff(tenant_id));
create policy website_enquiries_update on public.website_enquiries for update to authenticated using(public.is_staff(tenant_id)) with check(public.is_staff(tenant_id));

insert into public.website_pages(tenant_id,slug,title,description,content,status)
select t.id,v.slug,v.title,v.description,v.content,'published'
from public.tenants t
cross join (values
 ('home','NXT Workforce | Digital, Sales & Outsourcing Support','Your business is online. Is it working?',jsonb_build_object('eyebrow','NXT WORKFORCE','heading','Your business is online. Is it working?','body','We connect your website, marketing, leads, sales follow-up and business systems so the whole engine works together.','cta_label','Request a Free Audit','cta_href','/free-audit')),
 ('services','Services | NXT Workforce','Digital, sales and outsourcing support built around how your business actually works.',jsonb_build_object('eyebrow','SERVICES','heading','One partner for the whole engine.','body','From visibility and lead capture to follow-up, delivery and reporting, NXT brings the moving parts together.')),
 ('industries','Industries | NXT Workforce','Practical digital and operational support across key sectors.',jsonb_build_object('eyebrow','INDUSTRIES','heading','Built around the way your sector works.','body','Different sectors have different customer journeys, compliance needs and operating pressures. We adapt the system around them.')),
 ('about','About NXT Workforce','A Zimbabwean-founded digital, sales and outsourcing partner serving Zimbabwe, the UK and international clients.',jsonb_build_object('eyebrow','ABOUT NXT','heading','Digital support that stays close to the business.','body','NXT Workforce combines strategy, technology and people to help growing businesses operate more clearly and respond faster.')),
 ('contact','Contact NXT Workforce','Talk to NXT Workforce about your website, CRM, marketing, sales or operational support needs.',jsonb_build_object('eyebrow','CONTACT','heading','Tell us what feels difficult right now.','body','Send us the problem, not a polished brief. We will help you work out the next practical step.')),
 ('free-audit','Free Business Audit | NXT Workforce','Request a free audit of your website, SEO, social media, sales follow-up, customer experience or digital presence.',jsonb_build_object('eyebrow','FREE AUDIT','heading','Find the gaps before they cost you more leads.','body','Choose the area you want us to review and tell us what is not working as well as it should.')),
 ('insights','Insights | NXT Workforce','Practical insights on digital growth, CRM, outsourcing, customer experience and business systems.',jsonb_build_object('eyebrow','INSIGHTS','heading','Ideas you can actually use.','body','Practical thinking on marketing, sales, systems and outsourcing for growing businesses.')),
 ('blog','Blog | NXT Workforce','News, updates and practical guidance from NXT Workforce.',jsonb_build_object('eyebrow','BLOG','heading','What we are learning, building and watching.','body','Updates from NXT Workforce, our projects and the industries we support.'))
) as v(slug,title,description,content)
where t.slug='nxt-workforce'
on conflict (tenant_id,slug) do nothing;
commit;
