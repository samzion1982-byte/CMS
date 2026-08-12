-- ─────────────────────────────────────────────────────────────
--  Event Tasks - Add parent_id back for subtask hierarchy
-- ─────────────────────────────────────────────────────────────

alter table event_tasks
  add column if not exists parent_id uuid references event_tasks(id) on delete cascade;

create index if not exists et_parent_id_idx on event_tasks(parent_id);
