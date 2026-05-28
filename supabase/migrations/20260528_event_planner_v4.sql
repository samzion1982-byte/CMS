-- ─────────────────────────────────────────────────────────────
--  Event Planner v4 — add is_recurring to event_plans
-- ─────────────────────────────────────────────────────────────

-- is_recurring = true  → event repeats every year
--   + date_fixed = true  → same date every year (Christmas Dec 25)
--   + date_fixed = false → same dates booked tentatively, may need rescheduling (VBS)

alter table event_plans
  add column if not exists is_recurring boolean not null default false;
