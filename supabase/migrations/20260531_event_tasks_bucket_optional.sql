-- ─────────────────────────────────────────────────────────
--  Event Tasks - Make bucket_id optional (nullable)
--  Allows tasks to exist without bucket assignment
-- ─────────────────────────────────────────────────────────

alter table event_tasks
  alter column bucket_id drop not null;

alter table event_tasks
  drop constraint if exists event_tasks_bucket_id_fkey;

alter table event_tasks
  add constraint event_tasks_bucket_id_fkey
  foreign key (bucket_id)
  references event_task_buckets(id)
  on delete set null;
