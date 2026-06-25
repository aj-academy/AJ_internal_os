-- Task completion files submitted by assignee (student/employee) when marking complete.
alter table public.tasks
  add column if not exists completion_attachment_urls jsonb not null default '[]'::jsonb;

comment on column public.tasks.completion_attachment_urls is
  'Files uploaded by assignee with completion summary; visible to assigner in task view.';
