-- ─────────────────────────────────────────────────────────────
-- Add sticky task position fields to event_tasks
-- ─────────────────────────────────────────────────────────────

alter table event_tasks
  add column if not exists pos_x integer default 0,
  add column if not exists pos_y integer default 0;
