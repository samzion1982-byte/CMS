-- Church-configurable CMS master password (stored as SHA-256 hex hash).
-- Used for Fixed Assets unlock, document/directory deletes, accounting gates, etc.
-- NULL hash = legacy default password still accepted until a custom one is set.

ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS master_password_hash text;

COMMENT ON COLUMN churches.master_password_hash IS
  'SHA-256 hex of cms-master-v1:<password>. NULL means legacy default still applies.';
