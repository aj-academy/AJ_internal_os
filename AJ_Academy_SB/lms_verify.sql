-- =============================================================================
-- LMS verify — check what is installed (run anytime in Supabase SQL Editor)
-- MISSING rows appear first.
-- =============================================================================

select
  x.object_name,
  x.kind,
  case when x.ok then 'OK' else 'MISSING' end as status
from (
  values
    ('academic_departments', 'table', to_regclass('public.academic_departments') is not null),
    ('student_enrolments', 'table', to_regclass('public.student_enrolments') is not null),
    ('mentor_allocations', 'table', to_regclass('public.mentor_allocations') is not null),
    ('lms_mentor_has_active_allocation()', 'function', to_regprocedure('public.lms_mentor_has_active_allocation(uuid,uuid,uuid,uuid,uuid)') is not null),
    ('lms_assignments', 'table', to_regclass('public.lms_assignments') is not null),
    ('lms_projects', 'table', to_regclass('public.lms_projects') is not null),
    ('lms_study_materials', 'table', to_regclass('public.lms_study_materials') is not null),
    ('lms_student_tickets', 'table', to_regclass('public.lms_student_tickets') is not null),
    ('lms_tests', 'table', to_regclass('public.lms_tests') is not null),
    ('lms_test_proctoring_media', 'table', to_regclass('public.lms_test_proctoring_media') is not null),
    ('lms_academic_events', 'table', to_regclass('public.lms_academic_events') is not null),
    ('lms_submit_assignment()', 'function', to_regprocedure('public.lms_submit_assignment(uuid,text,text,jsonb,boolean)') is not null),
    ('lms_submit_project_milestone()', 'function', to_regprocedure('public.lms_submit_project_milestone(uuid,uuid,text,text,text,jsonb)') is not null),
    ('lms_evaluate_project_submission()', 'function', to_regprocedure('public.lms_evaluate_project_submission(uuid,numeric,text,text)') is not null),
    ('lms_register_proctoring_media()', 'function', to_regprocedure('public.lms_register_proctoring_media(uuid,text,text,uuid,text,bigint)') is not null),
    ('lms_report_summary()', 'function', to_regprocedure('public.lms_report_summary()') is not null)
) as x(object_name, kind, ok)
order by case when x.ok then 1 else 0 end, x.object_name;
