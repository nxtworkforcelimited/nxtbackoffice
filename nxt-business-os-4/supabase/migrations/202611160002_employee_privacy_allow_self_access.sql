-- Let every staff member read their own employee record and read/upload their own documents,
-- while keeping everyone else's records reviewer-only.
--
-- The reviewer-only RESTRICTIVE policies (employee_file_permission on employees,
-- private_hr_file_permission on employee_files) were FOR ALL, so they also hid each person's OWN
-- record and files. That overrode employees_self_read, employee_files_self_read and
-- employee_files_self_insert, and My Profile uploads failed with "Your staff record could not be
-- found." for anyone who was not the owner or a named HR reviewer.
--
-- Each policy is split per command: reading your own record, and reading or uploading your own
-- files, is allowed. Updating and deleting stay reviewer-only exactly as before. Other people's
-- records and files remain hidden from non-reviewers.
begin;

drop policy if exists employee_file_permission on public.employees;
create policy employee_privacy_read on public.employees as restrictive for select to authenticated
  using (public.employee_reviewer(tenant_id) or user_id = (select auth.uid()));
create policy employee_privacy_insert on public.employees as restrictive for insert to authenticated
  with check (public.employee_reviewer(tenant_id));
create policy employee_privacy_update on public.employees as restrictive for update to authenticated
  using (public.employee_reviewer(tenant_id)) with check (public.employee_reviewer(tenant_id));
create policy employee_privacy_delete on public.employees as restrictive for delete to authenticated
  using (public.employee_reviewer(tenant_id));

drop policy if exists private_hr_file_permission on public.employee_files;
create policy private_hr_file_read on public.employee_files as restrictive for select to authenticated
  using (public.employee_reviewer(tenant_id) or exists (select 1 from public.employees e
    where e.tenant_id = employee_files.tenant_id and e.id = employee_files.employee_id and e.user_id = (select auth.uid())));
create policy private_hr_file_insert on public.employee_files as restrictive for insert to authenticated
  with check (public.employee_reviewer(tenant_id) or exists (select 1 from public.employees e
    where e.tenant_id = employee_files.tenant_id and e.id = employee_files.employee_id and e.user_id = (select auth.uid())));
create policy private_hr_file_update on public.employee_files as restrictive for update to authenticated
  using (public.employee_reviewer(tenant_id)) with check (public.employee_reviewer(tenant_id));
create policy private_hr_file_delete on public.employee_files as restrictive for delete to authenticated
  using (public.employee_reviewer(tenant_id));

commit;
