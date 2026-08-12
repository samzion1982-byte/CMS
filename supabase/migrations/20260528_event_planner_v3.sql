-- ─────────────────────────────────────────────────────────────
--  Event Planner v3 — add date_fixed to event_plans
-- ─────────────────────────────────────────────────────────────

-- date_fixed = true  → same calendar date every year (e.g. Christmas Dec 25)
-- date_fixed = false → requires rescheduling each year (e.g. VBS, Camp)

alter table event_plans
  add column if not exists date_fixed boolean not null default false;
