-- ─────────────────────────────────────────────────────────────
--  Task Library and Event Task Hierarchy
-- ─────────────────────────────────────────────────────────────

-- Library of reusable task templates
create table if not exists task_library (
  id          uuid        primary key default gen_random_uuid(),
  parent_id   uuid        references task_library(id) on delete cascade,
  title       text        not null,
  description text,
  priority    text        not null default 'medium',
  sort_order  integer     not null default 0,
  created_by  text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table task_library enable row level security;
drop policy if exists "tl_select" on task_library;
drop policy if exists "tl_insert" on task_library;
drop policy if exists "tl_update" on task_library;
drop policy if exists "tl_delete" on task_library;
create policy "tl_select" on task_library for select to authenticated using (true);
create policy "tl_insert" on task_library for insert to authenticated with check (true);
create policy "tl_update" on task_library for update to authenticated using (true);
create policy "tl_delete" on task_library for delete to authenticated using (true);

create index if not exists tl_parent_id_idx on task_library(parent_id);

-- Allow event tasks to include subtasks
alter table event_tasks
  add column if not exists parent_id uuid references event_tasks(id) on delete cascade;

create index if not exists et_parent_id_idx on event_tasks(parent_id);
