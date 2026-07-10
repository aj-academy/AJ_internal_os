-- Student Master — additive counselling/admission columns on public.clients
-- Run after student_lead_master_schema.sql (and student_lead_master_aux_schema.sql if used).
-- Safe to re-run (IF NOT EXISTS).

alter table public.clients add column if not exists current_profile text;
alter table public.clients add column if not exists degree text;
alter table public.clients add column if not exists college_company text;
alter table public.clients add column if not exists year_of_passing text;
alter table public.clients add column if not exists employment_status text;
alter table public.clients add column if not exists current_salary numeric(12, 2);
alter table public.clients add column if not exists interested_program text;
alter table public.clients add column if not exists career_goal text;
alter table public.clients add column if not exists preferred_job_role text;
alter table public.clients add column if not exists target_salary numeric(12, 2);
alter table public.clients add column if not exists current_skill_level text;
alter table public.clients add column if not exists main_career_problem text;
alter table public.clients add column if not exists joining_timeline text;
alter table public.clients add column if not exists payment_plan text;
alter table public.clients add column if not exists parent_approval_required text;
alter table public.clients add column if not exists decision_maker text;
alter table public.clients add column if not exists preferred_batch text;
alter table public.clients add column if not exists laptop_availability text;
alter table public.clients add column if not exists lead_stage text;
alter table public.clients add column if not exists primary_objection text;
alter table public.clients add column if not exists fee_quoted numeric(12, 2);
alter table public.clients add column if not exists final_fee numeric(12, 2);
alter table public.clients add column if not exists payment_status text;
alter table public.clients add column if not exists admission_status text;

comment on column public.clients.interested_program is 'Student Master — program of interest';
comment on column public.clients.lead_stage is 'Student Master — counselling/admission stage';
comment on column public.clients.admission_status is 'Student Master — admission outcome';
