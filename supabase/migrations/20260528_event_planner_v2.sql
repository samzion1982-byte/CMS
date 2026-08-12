-- ─────────────────────────────────────────────────────────────
--  Event Planner v2 — add color and status to event_plans
-- ─────────────────────────────────────────────────────────────

alter table event_plans
  add column if not exists color  text,
  add column if not exists status text not null default 'planning';

-- status values: planning | active | completed | cancelled
