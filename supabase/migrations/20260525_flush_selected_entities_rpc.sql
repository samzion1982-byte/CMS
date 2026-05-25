-- RPC: flush_selected_entities(p_entity_ids uuid[])
-- Deletes all data for the specified accounting entities only.
-- Entities NOT in the list are completely untouched.
-- Resets accounting method lock only when no entities remain.

CREATE OR REPLACE FUNCTION flush_selected_entities(p_entity_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete in FK dependency order
  DELETE FROM accounting_audit_log
    WHERE entity_id IN (
      SELECT id FROM journal_entries WHERE entity_id = ANY(p_entity_ids)
    )
    OR entity_id IN (
      SELECT id FROM chart_of_accounts WHERE entity_id = ANY(p_entity_ids)
    );

  DELETE FROM journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM journal_entries WHERE entity_id = ANY(p_entity_ids)
    );

  DELETE FROM journal_entries    WHERE entity_id = ANY(p_entity_ids);
  DELETE FROM account_balances   WHERE entity_id = ANY(p_entity_ids);
  DELETE FROM bank_accounts      WHERE entity_id = ANY(p_entity_ids);
  DELETE FROM chart_of_accounts  WHERE entity_id = ANY(p_entity_ids);
  DELETE FROM accounting_entities WHERE id        = ANY(p_entity_ids);

  -- Reset method lock only when no books remain at all
  IF NOT EXISTS (SELECT 1 FROM accounting_entities LIMIT 1) THEN
    UPDATE churches
    SET accounting_entry_system_locked = false,
        accounting_entry_system        = 'double'
    WHERE id IS NOT NULL;
  END IF;
END;
$$;
