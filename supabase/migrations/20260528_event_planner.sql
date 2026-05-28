-- ─────────────────────────────────────────────────────────────
--  Event Planner Tables
-- ─────────────────────────────────────────────────────────────

-- Events
create table if not exists event_plans (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  event_type  text        not null default 'one-time',
  start_date  text,
  end_date    text,
  year        integer,
  description text,
  is_active   boolean     not null default true,
  created_by  text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table event_plans enable row level security;
drop policy if exists "ep_select" on event_plans;
drop policy if exists "ep_insert" on event_plans;
drop policy if exists "ep_update" on event_plans;
drop policy if exists "ep_delete" on event_plans;
create policy "ep_select" on event_plans for select to authenticated using (true);
create policy "ep_insert" on event_plans for insert to authenticated with check (true);
create policy "ep_update" on event_plans for update to authenticated using (true);
create policy "ep_delete" on event_plans for delete to authenticated using (true);

-- Task Buckets (columns on the Kanban board)
create table if not exists event_task_buckets (
  id         uuid        primary key default gen_random_uuid(),
  event_id   uuid        not null references event_plans(id) on delete cascade,
  name       text        not null,
  color      text        not null default '#6366f1',
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table event_task_buckets enable row level security;
drop policy if exists "etb_select" on event_task_buckets;
drop policy if exists "etb_insert" on event_task_buckets;
drop policy if exists "etb_update" on event_task_buckets;
drop policy if exists "etb_delete" on event_task_buckets;
create policy "etb_select" on event_task_buckets for select to authenticated using (true);
create policy "etb_insert" on event_task_buckets for insert to authenticated with check (true);
create policy "etb_update" on event_task_buckets for update to authenticated using (true);
create policy "etb_delete" on event_task_buckets for delete to authenticated using (true);

-- Tasks
create table if not exists event_tasks (
  id          uuid        primary key default gen_random_uuid(),
  event_id    uuid        not null references event_plans(id)         on delete cascade,
  bucket_id   uuid        not null references event_task_buckets(id)  on delete cascade,
  title       text        not null,
  description text,
  assigned_to text,
  due_date    text,
  status      text        not null default 'pending',
  priority    text        not null default 'medium',
  sort_order  integer     not null default 0,
  notes       text,
  created_by  text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table event_tasks enable row level security;
drop policy if exists "et_select" on event_tasks;
drop policy if exists "et_insert" on event_tasks;
drop policy if exists "et_update" on event_tasks;
drop policy if exists "et_delete" on event_tasks;
create policy "et_select" on event_tasks for select to authenticated using (true);
create policy "et_insert" on event_tasks for insert to authenticated with check (true);
create policy "et_update" on event_tasks for update to authenticated using (true);
create policy "et_delete" on event_tasks for delete to authenticated using (true);

-- Indexes
create index if not exists etb_event_id_idx on event_task_buckets(event_id);
create index if not exists et_event_id_idx  on event_tasks(event_id);
create index if not exists et_bucket_id_idx on event_tasks(bucket_id);
