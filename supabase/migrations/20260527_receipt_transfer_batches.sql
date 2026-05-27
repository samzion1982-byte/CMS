-- Receipt → Accounts transfer batches
-- Each batch transfers a range of receipts into two journal entries (Cash JV + Bank JV)

CREATE TABLE IF NOT EXISTS receipt_transfer_batches (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_date         date        NOT NULL,
  to_date           date        NOT NULL,
  from_receipt_no   text        NOT NULL,
  to_receipt_no     text        NOT NULL,
  financial_year    text        NOT NULL,
  entity_id         uuid        REFERENCES accounting_entities(id) ON DELETE SET NULL,
  cash_journal_id   uuid        REFERENCES journal_entries(id) ON DELETE SET NULL,
  bank_journal_id   uuid        REFERENCES journal_entries(id) ON DELETE SET NULL,
  bank_account_id   uuid        REFERENCES bank_accounts(id)   ON DELETE SET NULL,
  receipt_count     integer     NOT NULL DEFAULT 0,
  cash_total        numeric(14,2) NOT NULL DEFAULT 0,
  bank_total        numeric(14,2) NOT NULL DEFAULT 0,
  transferred_at    timestamptz NOT NULL DEFAULT now(),
  transferred_by    text,
  notes             text,
  is_reversed       boolean     NOT NULL DEFAULT false,
  reversed_at       timestamptz,
  reversed_by       text
);

CREATE INDEX IF NOT EXISTS idx_rtb_fy         ON receipt_transfer_batches(financial_year);
CREATE INDEX IF NOT EXISTS idx_rtb_dates      ON receipt_transfer_batches(from_date, to_date);
CREATE INDEX IF NOT EXISTS idx_rtb_reversed   ON receipt_transfer_batches(is_reversed);

-- Track which batch each receipt belongs to (null = not yet transferred)
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS transfer_batch_id uuid REFERENCES receipt_transfer_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_receipts_transfer_batch ON receipts(transfer_batch_id);
