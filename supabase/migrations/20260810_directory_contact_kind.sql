-- Phone Directory: person vs organisation contact kind
ALTER TABLE directory_contacts
  ADD COLUMN IF NOT EXISTS contact_kind text NOT NULL DEFAULT 'person'
    CHECK (contact_kind IN ('person', 'organisation'));

CREATE INDEX IF NOT EXISTS idx_directory_contacts_kind
  ON directory_contacts (contact_kind);
