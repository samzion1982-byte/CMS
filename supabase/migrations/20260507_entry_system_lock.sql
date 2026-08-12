-- Track whether the entry system has been confirmed and locked
ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS accounting_entry_system_locked boolean NOT NULL DEFAULT false;
