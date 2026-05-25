-- RPC: flush_selected_entities(p_entity_ids uuid[])
-- Deletes all data for the specified accounting entities only.
-- Entities NOT in the list are completely untouched.
-- NOTE: bank_accounts has no entity_id column so cannot be entity-scoped;
--       its COA link (coa_account_id) is SET NULL automatically via FK cascade
--       when chart_of_accounts rows are deleted.

CREATE OR REPLACE FUNCTION flush_selected_entities(p_entity_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Audit log: generic entity_id references journals and COA
  DELETE FROM accounting_audit_log
    WHERE entity_id IN (
      SELECT id FROM journal_entries WHERE entity_id = ANY(p_entity_ids)
    )
    OR entity_id IN (
      SELECT id FROM chart_of_accounts WHERE entity_id = ANY(p_entity_ids)
    );

  -- journal_entry_lines references journal_entries via journal_entry_id
  DELETE FROM journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM journal_entries WHERE entity_id = ANY(p_entity_ids)
    );

  DELETE FROM journal_entries  WHERE entity_id = ANY(p_entity_ids);
  DELETE FROM account_balances WHERE entity_id = ANY(p_entity_ids);

  -- chart_of_accounts: ON DELETE SET NULL on bank_accounts.coa_account_id handles cleanup
  DELETE FROM chart_of_accounts WHERE entity_id = ANY(p_entity_ids);

  DELETE FROM accounting_entities WHERE id = ANY(p_entity_ids);

  -- Reset method lock only when no books remain
  IF NOT EXISTS (SELECT 1 FROM accounting_entities LIMIT 1) THEN
    UPDATE churches
    SET accounting_entry_system_locked = false,
        accounting_entry_system        = 'double'
    WHERE id IS NOT NULL;
  END IF;
END;
$$;
