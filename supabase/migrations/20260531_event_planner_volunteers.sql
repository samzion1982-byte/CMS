-- ────────────────────────────────────────────────────────────────
--  Event Planner Volunteers and Task Assignment
-- ────────────────────────────────────────────────────────────────

-- Volunteer master data for event planner
create table if not exists event_volunteers (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  role            text,
  whatsapp        text,
  sort_order      integer     not null default 0,
  created_by      text,
  updated_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table event_volunteers enable row level security;
drop policy if exists "ev_select" on event_volunteers;
drop policy if exists "ev_insert" on event_volunteers;
drop policy if exists "ev_update" on event_volunteers;
drop policy if exists "ev_delete" on event_volunteers;
create policy "ev_select" on event_volunteers for select to authenticated using (true);
create policy "ev_insert" on event_volunteers for insert to authenticated with check (true);
create policy "ev_update" on event_volunteers for update to authenticated using (true);
create policy "ev_delete" on event_volunteers for delete to authenticated using (true);

create index if not exists ev_sort_order_idx on event_volunteers(sort_order);
create index if not exists ev_whatsapp_idx on event_volunteers(whatsapp);

alter table event_tasks
  add column if not exists assigned_volunteer_id uuid references event_volunteers(id) on delete set null;

create index if not exists et_assigned_volunteer_id_idx on event_tasks(assigned_volunteer_id);

-- Seed a starter library template for Christmas Carols planning
insert into task_library (id, parent_id, title, description, priority, sort_order, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', null, 'Christmas Carols', 'Christmas Carols event template', 'medium', 0, now(), now()),
  ('00000000-00000000-000000000002', '00000000-0000-0000-0000-000000000001', 'Dinner', 'Arrange dinner for the carol event', 'medium', 0, now(), now()),
  ('00000000-00000000-000000000003', '00000000-0000-0000-000000000001', 'Tea & Coffee', 'Serve tea and coffee to guests', 'medium', 1, now(), now()),
  ('00000000-00000000-000000000004', '00000000-0000-0000-000000000001', 'Calendar', 'Prepare and distribute the event calendar', 'medium', 2, now(), now()),
  ('00000000-00000000-000000000005', '00000000-0000-0000-000000000001', 'Promise Cards', 'Create and hand out promise cards', 'medium', 3, now(), now()),
  ('00000000-00000000-000000000006', '00000000-0000-0000-000000000001', 'Offering Envelopes', 'Prepare offering envelopes for the service', 'medium', 4, now(), now());
