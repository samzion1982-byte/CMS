-- ═══════════════════════════════════════════════════════════════
-- COA Hierarchy Migration
-- Adds level + is_postable columns, clears flat seed, re-seeds
-- with 3-level drill-down structure (Main → Group → Ledger)
-- ═══════════════════════════════════════════════════════════════

-- Add hierarchy columns
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS level       integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS is_postable boolean NOT NULL DEFAULT true;

-- Clear old flat seed (only if no transactions exist)
DELETE FROM chart_of_accounts
WHERE id NOT IN (SELECT DISTINCT account_id FROM journal_entry_lines);

-- ── LEVEL 1 — Main Groups (non-postable) ─────────────────────────
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, sort_order) VALUES
  ('A',   'Assets',           'Asset',     1, false, 10),
  ('L',   'Liabilities',      'Liability', 1, false, 20),
  ('EQ',  'Equity & Funds',   'Equity',    1, false, 30),
  ('INC', 'Income',           'Income',    1, false, 40),
  ('EXP', 'Expenses',         'Expense',   1, false, 50)
ON CONFLICT (code) DO NOTHING;

-- ── LEVEL 2 — Account Groups (non-postable) ──────────────────────

-- Assets sub-groups
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'A')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Asset', 2, false, p.id, so FROM p, (VALUES
  ('A-CA',  'Current Assets',    10),
  ('A-FA',  'Fixed Assets',      20),
  ('A-INV', 'Investments',       30),
  ('A-ADV', 'Advances & Loans',  40)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Liabilities sub-groups
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'L')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Liability', 2, false, p.id, so FROM p, (VALUES
  ('L-CL', 'Current Liabilities',   10),
  ('L-LL', 'Long-term Liabilities', 20)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Equity sub-groups
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'EQ')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Equity', 2, false, p.id, so FROM p, (VALUES
  ('EQ-CF', 'Church Funds',  10),
  ('EQ-RS', 'Reserves',      20)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Income sub-groups
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'INC')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Income', 2, false, p.id, so FROM p, (VALUES
  ('INC-CH', 'Church Collections', 10),
  ('INC-OT', 'Other Income',       20)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Expenses sub-groups
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'EXP')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Expense', 2, false, p.id, so FROM p, (VALUES
  ('EXP-ST', 'Staff & Clergy',       10),
  ('EXP-AD', 'Administration',       20),
  ('EXP-MN', 'Ministry & Outreach',  30),
  ('EXP-MT', 'Maintenance',          40)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- ── LEVEL 3 — Ledgers (postable) ─────────────────────────────────

-- Current Assets ledgers
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'A-CA')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Asset', 3, true, p.id, so FROM p, (VALUES
  ('A-CA-001', 'Cash in Hand',            10),
  ('A-CA-002', 'Petty Cash',              20),
  ('A-CA-003', 'Bank - Current Account',  30),
  ('A-CA-004', 'Bank - Savings Account',  40)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Fixed Assets ledgers
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'A-FA')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Asset', 3, true, p.id, so FROM p, (VALUES
  ('A-FA-001', 'Building / Church Property', 10),
  ('A-FA-002', 'Furniture & Equipment',      20),
  ('A-FA-003', 'Musical Instruments',        30),
  ('A-FA-004', 'Vehicles',                   40)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Investments ledgers
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'A-INV')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Asset', 3, true, p.id, so FROM p, (VALUES
  ('A-INV-001', 'Fixed Deposits',  10),
  ('A-INV-002', 'Recurring Deposits', 20)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Advances ledgers
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'A-ADV')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Asset', 3, true, p.id, so FROM p, (VALUES
  ('A-ADV-001', 'Advance to Staff',    10),
  ('A-ADV-002', 'Advance to Members',  20)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Current Liabilities ledgers
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'L-CL')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Liability', 3, true, p.id, so FROM p, (VALUES
  ('L-CL-001', 'Accounts Payable',      10),
  ('L-CL-002', 'Advance from Members',  20),
  ('L-CL-003', 'Dues & Payables',       30)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Long-term Liabilities ledgers
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'L-LL')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Liability', 3, true, p.id, so FROM p, (VALUES
  ('L-LL-001', 'Loan from Bank',    10),
  ('L-LL-002', 'Loan from Members', 20)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Church Funds ledgers
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'EQ-CF')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Equity', 3, true, p.id, so FROM p, (VALUES
  ('EQ-CF-001', 'General Fund',      10),
  ('EQ-CF-002', 'Building Fund',     20),
  ('EQ-CF-003', 'Mission Fund',      30),
  ('EQ-CF-004', 'Education Fund',    40),
  ('EQ-CF-005', 'Benevolence Fund',  50)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Reserves ledgers
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'EQ-RS')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Equity', 3, true, p.id, so FROM p, (VALUES
  ('EQ-RS-001', 'Opening Balance Reserve',  10),
  ('EQ-RS-002', 'Surplus / Deficit',        20)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Church Collections ledgers
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'INC-CH')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Income', 3, true, p.id, so FROM p, (VALUES
  ('INC-CH-001', 'Sunday Offerings',        10),
  ('INC-CH-002', 'Tithe / Subscription',    20),
  ('INC-CH-003', 'Special Offerings',       30),
  ('INC-CH-004', 'Harvest Festival',        40),
  ('INC-CH-005', 'Christmas / Easter Offerings', 50)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Other Income ledgers
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'INC-OT')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Income', 3, true, p.id, so FROM p, (VALUES
  ('INC-OT-001', 'Donations',        10),
  ('INC-OT-002', 'Interest Income',  20),
  ('INC-OT-003', 'Rent Income',      30),
  ('INC-OT-004', 'Other Income',     40)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Staff & Clergy ledgers
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'EXP-ST')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Expense', 3, true, p.id, so FROM p, (VALUES
  ('EXP-ST-001', 'Pastoral Salary',        10),
  ('EXP-ST-002', 'Staff Salaries',         20),
  ('EXP-ST-003', 'Provident Fund',         30),
  ('EXP-ST-004', 'Staff Medical',          40),
  ('EXP-ST-005', 'Pastoral Allowances',    50)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Administration ledgers
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'EXP-AD')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Expense', 3, true, p.id, so FROM p, (VALUES
  ('EXP-AD-001', 'Stationery & Printing',  10),
  ('EXP-AD-002', 'Postage & Courier',      20),
  ('EXP-AD-003', 'Bank Charges',           30),
  ('EXP-AD-004', 'Audit Fees',             40),
  ('EXP-AD-005', 'Miscellaneous',          50)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Ministry & Outreach ledgers
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'EXP-MN')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Expense', 3, true, p.id, so FROM p, (VALUES
  ('EXP-MN-001', 'Mission & Evangelism',   10),
  ('EXP-MN-002', 'Sunday School',          20),
  ('EXP-MN-003', 'Youth Ministry',         30),
  ('EXP-MN-004', 'Women Fellowship',       40),
  ('EXP-MN-005', 'Special Programmes',     50),
  ('EXP-MN-006', 'Medical / Benevolence',  60)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;

-- Maintenance ledgers
WITH p AS (SELECT id FROM chart_of_accounts WHERE code = 'EXP-MT')
INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order)
SELECT code, name, 'Expense', 3, true, p.id, so FROM p, (VALUES
  ('EXP-MT-001', 'Electricity & Water',     10),
  ('EXP-MT-002', 'Building Maintenance',    20),
  ('EXP-MT-003', 'Furniture Repairs',       30),
  ('EXP-MT-004', 'Vehicle Maintenance',     40),
  ('EXP-MT-005', 'Travel & Conveyance',     50)
) AS v(code, name, so)
ON CONFLICT (code) DO NOTHING;
