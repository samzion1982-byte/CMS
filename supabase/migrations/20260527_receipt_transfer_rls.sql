-- RLS policies for receipt_transfer_batches
ALTER TABLE receipt_transfer_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rtb_select" ON receipt_transfer_batches
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "rtb_insert" ON receipt_transfer_batches
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "rtb_update" ON receipt_transfer_batches
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "rtb_delete" ON receipt_transfer_batches
  FOR DELETE TO authenticated USING (true);

-- RLS for payment_categories (needed for coa_account_id updates during transfer)
ALTER TABLE payment_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paycat_select" ON payment_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "paycat_insert" ON payment_categories
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "paycat_update" ON payment_categories
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "paycat_delete" ON payment_categories
  FOR DELETE TO authenticated USING (true);
