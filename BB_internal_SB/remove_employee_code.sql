-- Drop employee_code (not used in attendance or current app workflows).
-- Safe to re-run. employee_master is optional (many projects only use employee_details).

alter table public.employee_details
  drop column if exists employee_code;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'employee_master'
  ) then
    alter table public.employee_master drop column if exists employee_code;
  end if;
end $$;
