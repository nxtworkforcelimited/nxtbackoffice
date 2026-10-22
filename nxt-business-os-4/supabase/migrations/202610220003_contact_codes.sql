-- Stable, automatically generated contact references for CRM/client records.

alter table public.clients
  add column if not exists contact_code text;

create sequence if not exists public.client_contact_code_seq start with 1 increment by 1;

-- Preserve legacy references that were previously typed into contact names.
update public.clients
set contact_code = upper((regexp_match(title, '^\\s*(NCN[0-9]+)\\s*'))[1])
where contact_code is null
  and title ~* '^\\s*NCN[0-9]+';

-- Keep the company/contact name separate from the immutable database reference.
update public.clients
set title = btrim(regexp_replace(title, '^\\s*NCN[0-9]+\\s*', '', 'i'))
where title ~* '^\\s*NCN[0-9]+';

select setval(
  'public.client_contact_code_seq',
  greatest(
    coalesce((
      select max(substring(contact_code from '[0-9]+')::bigint)
      from public.clients
      where contact_code ~ '^NCN[0-9]+$'
    ),0),
    1
  ),
  true
);

update public.clients
set contact_code='NCN'||lpad(nextval('public.client_contact_code_seq')::text,3,'0')
where contact_code is null;

alter table public.clients
  alter column contact_code
  set default ('NCN'||lpad(nextval('public.client_contact_code_seq')::text,3,'0'));

alter table public.clients
  alter column contact_code set not null;

create unique index if not exists clients_contact_code_unique
  on public.clients(contact_code);

create or replace function public.guard_client_contact_code()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op='UPDATE' and new.contact_code is distinct from old.contact_code then
    raise exception 'Contact reference cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists client_contact_code_guard on public.clients;
create trigger client_contact_code_guard
before update on public.clients
for each row execute function public.guard_client_contact_code();
