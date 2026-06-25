-- Allow employee, mentor, and freelancer portal users to submit and view their own expense claims.

drop policy if exists "expense_claims_portal_member_own" on public.expense_claims;
create policy "expense_claims_portal_member_own"
on public.expense_claims
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('employee', 'mentor', 'freelancer')
  )
  and employee_id = auth.uid ()
);

drop policy if exists "expense_claims_portal_member_insert" on public.expense_claims;
create policy "expense_claims_portal_member_insert"
on public.expense_claims
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('employee', 'mentor', 'freelancer')
  )
  and employee_id = auth.uid ()
);

drop policy if exists "expense_claims_portal_member_update_own_pending" on public.expense_claims;
create policy "expense_claims_portal_member_update_own_pending"
on public.expense_claims
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('employee', 'mentor', 'freelancer')
  )
  and employee_id = auth.uid ()
  and approval_status = 'Pending'
)
with check (
  employee_id = auth.uid ()
  and approval_status = 'Pending'
);
