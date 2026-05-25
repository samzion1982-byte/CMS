-- RPC: flush_selected_entities(p_entity_ids uuid[])
-- Clears all financial data for the selected entities and re-seeds standard COA.
-- The accounting entities (books) themselves are PRESERVED.
-- To permanently delete a book, use the Entity Management page.

CREATE OR REPLACE FUNCTION flush_selected_entities(p_entity_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_eid uuid;
BEGIN
  -- Audit log entries for selected entities' journals and COA
  DELETE FROM accounting_audit_log
    WHERE entity_id IN (
      SELECT id FROM journal_entries WHERE entity_id = ANY(p_entity_ids)
    )
    OR entity_id IN (
      SELECT id FROM chart_of_accounts WHERE entity_id = ANY(p_entity_ids)
    );

  -- journal_entry_lines via journal_entry_id FK
  DELETE FROM journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM journal_entries WHERE entity_id = ANY(p_entity_ids)
    );

  DELETE FROM journal_entries  WHERE entity_id = ANY(p_entity_ids);
  DELETE FROM account_balances WHERE entity_id = ANY(p_entity_ids);
  DELETE FROM chart_of_accounts WHERE entity_id = ANY(p_entity_ids);

  -- Re-seed standard COA for every flushed entity
  FOREACH v_eid IN ARRAY p_entity_ids LOOP
    PERFORM seed_standard_coa(v_eid);
  END LOOP;

  -- Reset entry system lock (allows switching Single/Double after flush)
  UPDATE churches
  SET accounting_entry_system_locked = false,
      accounting_entry_system        = 'double'
  WHERE id IS NOT NULL;
END;
$$;
