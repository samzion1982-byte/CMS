-- ─────────────────────────────────────────────────────────────
--  Task Library - Simplified Two-Column Template
--  Removes parent_id hierarchy, adds explicit category/subcategory columns
-- ─────────────────────────────────────────────────────────────

-- Backup existing data (if any) into a temporary table
create table if not exists task_library_backup as
select * from task_library;

-- Drop the old table
drop table if exists task_library cascade;

-- Create new simplified task_library table
create table if not exists task_library (
  id              uuid        primary key default gen_random_uuid(),
  category        text        not null,              -- e.g., "Food & Catering"
  subcategory     text,                              -- e.g., "Breakfast", "Lunch", "Dinner" (null for category-only rows)
  sort_order      integer     not null default 0,
  created_by      text,
  updated_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
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

create index if not exists tl_category_idx on task_library(category);
create index if not exists tl_sort_order_idx on task_library(sort_order);

-- Remove parent_id reference from event_tasks if it exists
alter table event_tasks
  drop column if exists parent_id;

-- Seed data: Library template
insert into task_library (category, subcategory, sort_order, created_at, updated_at)
values
  ('Food & Catering', 'Breakfast', 1, now(), now()),
  ('Food & Catering', 'Lunch', 2, now(), now()),
  ('Food & Catering', 'Dinner', 3, now(), now()),
  ('Food & Catering', 'Snacks', 4, now(), now()),
  ('Food & Catering', 'Tea & Coffee', 5, now(), now()),
  ('Food & Catering', 'Ice Cream', 6, now(), now()),
  ('Food & Catering', 'Cake', 7, now(), now()),
  ('Food & Catering', 'Buttermilk', 8, now(), now()),
  ('Food & Catering', 'Chocolates', 9, now(), now()),
  ('Freebies & Gifts', 'Shawls', 10, now(), now()),
  ('Freebies & Gifts', 'Mementos', 11, now(), now()),
  ('Freebies & Gifts', 'Calendar', 12, now(), now()),
  ('Freebies & Gifts', 'Promise Cards', 13, now(), now());
