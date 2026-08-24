-- Event planner preferences shared across enrolled users.
ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS event_planner_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
