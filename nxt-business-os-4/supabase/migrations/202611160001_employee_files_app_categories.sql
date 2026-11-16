-- Allow the document types the app actually sends (My Profile and People pages).
-- Before this, "National ID" (ID copy), "Driver Licence", "Next of Kin", "Medical" and
-- "Association / Society" uploads were rejected by employee_files_category_check.
-- Additive only: every previously allowed value is kept, so existing rows stay valid.
-- Applied to production on 2026-11-16 as migration "employee_files_app_categories".
begin;
alter table public.employee_files drop constraint if exists employee_files_category_check;
alter table public.employee_files add constraint employee_files_category_check
  check (category in ('Profile Photo','CV','ID','National ID','Driver Licence','Contract','Next of Kin','Medical','Association / Society','Other'));
commit;
notify pgrst, 'reload schema';
