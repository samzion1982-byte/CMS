-- Soft delete support for journal entries
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS is_deleted  boolean    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by  text;

CREATE INDEX IF NOT EXISTS idx_je_deleted ON journal_entries(is_deleted);

-- Password required for permanent (hard) delete of journal entries
ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS accounting_delete_password text;
