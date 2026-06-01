-- ─────────────────────────────────────────────────────────────
-- Allow NULL subcategory in task_library for category-only rows
-- ─────────────────────────────────────────────────────────────

alter table task_library
  alter column subcategory drop not null;
