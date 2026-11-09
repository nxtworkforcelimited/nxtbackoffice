-- Client portal: My Website, My Back Office (with integrations) and the SMS switch for Tasks and Messages.
-- Additive only. Nothing is shown to a client until staff switch it on for that client or build.
begin;

-- Which extra portal features NXT has switched on for a client. Today: 'sms' shows Tasks and Messages.
alter table public.clients add column if not exists portal_features text[] not null default '{}';
alter table public.clients drop constraint if exists clients_portal_features_check;
alter table public.clients add constraint clients_portal_features_check check(portal_features <@ array['sms']::text[]);

-- Builds: show to the client (off by default), where the client logs in to their back office, and connected systems.
alter table public.backoffice_builds
 add column if not exists client_visible boolean not null default false,
 add column if not exists backoffice_url text not null default '',
 add column if not exists integrations jsonb not null default '[]'::jsonb;
alter table public.backoffice_builds drop constraint if exists backoffice_builds_backoffice_url_check;
alter table public.backoffice_builds add constraint backoffice_builds_backoffice_url_check check(backoffice_url='' or backoffice_url ~ '^https?://');
alter table public.backoffice_builds drop constraint if exists backoffice_builds_integrations_is_array;
alter table public.backoffice_builds add constraint backoffice_builds_integrations_is_array check(jsonb_typeof(integrations)='array' and jsonb_array_length(integrations)<=20);

commit;
