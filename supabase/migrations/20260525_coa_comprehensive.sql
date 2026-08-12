-- ═══════════════════════════════════════════════════════════════
-- Comprehensive Chart of Accounts for Church / Church Organisation
-- 5 Main Groups → 14 Account Groups → 67 Ledgers
-- Safe to re-run — uses ON CONFLICT (code) DO NOTHING
-- entity_id is assigned from the first accounting entity
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_eid uuid;
BEGIN
  SELECT id INTO v_eid FROM accounting_entities ORDER BY created_at LIMIT 1;

  -- ── LEVEL 1 — Main Groups ───────────────────────────────────
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, sort_order, entity_id) VALUES
    ('A',   'Assets',           'Asset',     1, false, 10, v_eid),
    ('L',   'Liabilities',      'Liability', 1, false, 20, v_eid),
    ('EQ',  'Equity & Funds',   'Equity',    1, false, 30, v_eid),
    ('INC', 'Income',           'Income',    1, false, 40, v_eid),
    ('EXP', 'Expenses',         'Expense',   1, false, 50, v_eid)
  ON CONFLICT (code) DO NOTHING;

  -- ── LEVEL 2 — Account Groups ────────────────────────────────

  -- Assets
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Asset', 2, false, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('A-CA',  'Current Assets',    10),
    ('A-FA',  'Fixed Assets',      20),
    ('A-INV', 'Investments',       30),
    ('A-ADV', 'Advances & Loans',  40)
  ) AS v(code, name, so) WHERE p.code = 'A'
  ON CONFLICT (code) DO NOTHING;

  -- Liabilities
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Liability', 2, false, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('L-CL', 'Current Liabilities',   10),
    ('L-LL', 'Long-term Liabilities', 20)
  ) AS v(code, name, so) WHERE p.code = 'L'
  ON CONFLICT (code) DO NOTHING;

  -- Equity
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Equity', 2, false, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('EQ-CF', 'Church Funds',  10),
    ('EQ-RS', 'Reserves',      20)
  ) AS v(code, name, so) WHERE p.code = 'EQ'
  ON CONFLICT (code) DO NOTHING;

  -- Income
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Income', 2, false, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('INC-CH', 'Church Collections', 10),
    ('INC-OT', 'Other Income',       20)
  ) AS v(code, name, so) WHERE p.code = 'INC'
  ON CONFLICT (code) DO NOTHING;

  -- Expenses
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Expense', 2, false, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('EXP-ST', 'Staff & Clergy',       10),
    ('EXP-AD', 'Administration',       20),
    ('EXP-MN', 'Ministry & Outreach',  30),
    ('EXP-MT', 'Maintenance',          40)
  ) AS v(code, name, so) WHERE p.code = 'EXP'
  ON CONFLICT (code) DO NOTHING;

  -- ── LEVEL 3 — Ledgers ───────────────────────────────────────

  -- Current Assets
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Asset', 3, true, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('A-CA-001', 'Cash in Hand',                          10),
    ('A-CA-002', 'Petty Cash',                            20),
    ('A-CA-003', 'Bank - Current Account',                30),
    ('A-CA-004', 'Bank - Savings Account',                40),
    ('A-CA-005', 'Accounts Receivable / Dues Receivable', 50),
    ('A-CA-006', 'Prepaid Expenses',                      60)
  ) AS v(code, name, so) WHERE p.code = 'A-CA'
  ON CONFLICT (code) DO NOTHING;

  -- Fixed Assets
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Asset', 3, true, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('A-FA-001', 'Building / Church Property', 10),
    ('A-FA-002', 'Furniture & Equipment',      20),
    ('A-FA-003', 'Musical Instruments',        30),
    ('A-FA-004', 'Vehicles',                   40),
    ('A-FA-005', 'Computer & Electronics',     50),
    ('A-FA-006', 'Cemetery Land',              60)
  ) AS v(code, name, so) WHERE p.code = 'A-FA'
  ON CONFLICT (code) DO NOTHING;

  -- Investments
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Asset', 3, true, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('A-INV-001', 'Fixed Deposits',      10),
    ('A-INV-002', 'Recurring Deposits',  20)
  ) AS v(code, name, so) WHERE p.code = 'A-INV'
  ON CONFLICT (code) DO NOTHING;

  -- Advances & Loans
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Asset', 3, true, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('A-ADV-001', 'Advance to Staff',    10),
    ('A-ADV-002', 'Advance to Members',  20)
  ) AS v(code, name, so) WHERE p.code = 'A-ADV'
  ON CONFLICT (code) DO NOTHING;

  -- Current Liabilities
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Liability', 3, true, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('L-CL-001', 'Accounts Payable',           10),
    ('L-CL-002', 'Advance from Members',       20),
    ('L-CL-003', 'Dues & Payables',            30),
    ('L-CL-004', 'Salary Payable',             40),
    ('L-CL-005', 'TDS / Tax Payable',          50),
    ('L-CL-006', 'Security Deposits Received', 60)
  ) AS v(code, name, so) WHERE p.code = 'L-CL'
  ON CONFLICT (code) DO NOTHING;

  -- Long-term Liabilities
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Liability', 3, true, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('L-LL-001', 'Loan from Bank',    10),
    ('L-LL-002', 'Loan from Members', 20)
  ) AS v(code, name, so) WHERE p.code = 'L-LL'
  ON CONFLICT (code) DO NOTHING;

  -- Church Funds
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Equity', 3, true, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('EQ-CF-001', 'General Fund',      10),
    ('EQ-CF-002', 'Building Fund',     20),
    ('EQ-CF-003', 'Mission Fund',      30),
    ('EQ-CF-004', 'Education Fund',    40),
    ('EQ-CF-005', 'Benevolence Fund',  50)
  ) AS v(code, name, so) WHERE p.code = 'EQ-CF'
  ON CONFLICT (code) DO NOTHING;

  -- Reserves
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Equity', 3, true, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('EQ-RS-001', 'Opening Balance Reserve',  10),
    ('EQ-RS-002', 'Surplus / Deficit',        20)
  ) AS v(code, name, so) WHERE p.code = 'EQ-RS'
  ON CONFLICT (code) DO NOTHING;

  -- Church Collections
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Income', 3, true, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('INC-CH-001', 'Sunday Offerings',                 10),
    ('INC-CH-002', 'Tithe / Subscription',             20),
    ('INC-CH-003', 'Special Offerings',                30),
    ('INC-CH-004', 'Harvest Festival',                 40),
    ('INC-CH-005', 'Christmas / Easter Offerings',     50),
    ('INC-CH-006', 'Marriage / Funeral Service Fees',  60),
    ('INC-CH-007', 'Baptism & Confirmation Offerings', 70),
    ('INC-CH-008', 'Hall Rental Income',               80),
    ('INC-CH-009', 'Cemetery Charges',                 90)
  ) AS v(code, name, so) WHERE p.code = 'INC-CH'
  ON CONFLICT (code) DO NOTHING;

  -- Other Income
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Income', 3, true, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('INC-OT-001', 'Donations',                 10),
    ('INC-OT-002', 'Interest Income',           20),
    ('INC-OT-003', 'Rent Income',               30),
    ('INC-OT-004', 'Other Income',              40),
    ('INC-OT-005', 'Sale of Books / Materials', 50),
    ('INC-OT-006', 'Grants & Aid Received',     60)
  ) AS v(code, name, so) WHERE p.code = 'INC-OT'
  ON CONFLICT (code) DO NOTHING;

  -- Staff & Clergy
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Expense', 3, true, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('EXP-ST-001', 'Pastoral Salary',                10),
    ('EXP-ST-002', 'Staff Salaries',                 20),
    ('EXP-ST-003', 'Provident Fund',                 30),
    ('EXP-ST-004', 'Staff Medical',                  40),
    ('EXP-ST-005', 'Pastoral Allowances',            50),
    ('EXP-ST-006', 'Sexton Honorarium',              60),
    ('EXP-ST-007', 'Gratuity / Retirement Benefits', 70),
    ('EXP-ST-008', 'ESI / Staff Insurance',          80)
  ) AS v(code, name, so) WHERE p.code = 'EXP-ST'
  ON CONFLICT (code) DO NOTHING;

  -- Administration
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Expense', 3, true, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('EXP-AD-001', 'Stationery & Printing',        10),
    ('EXP-AD-002', 'Postage & Courier',            20),
    ('EXP-AD-003', 'Bank Charges',                 30),
    ('EXP-AD-004', 'Audit Fees',                   40),
    ('EXP-AD-005', 'Miscellaneous',                50),
    ('EXP-AD-006', 'Telephone & Internet',         60),
    ('EXP-AD-007', 'Bulletin & Circular Printing', 70),
    ('EXP-AD-008', 'Diocesan Assessment / Dues',   80),
    ('EXP-AD-009', 'Legal & Professional Fees',    90)
  ) AS v(code, name, so) WHERE p.code = 'EXP-AD'
  ON CONFLICT (code) DO NOTHING;

  -- Ministry & Outreach
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Expense', 3, true, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('EXP-MN-001', 'Mission & Evangelism',       10),
    ('EXP-MN-002', 'Sunday School',              20),
    ('EXP-MN-003', 'Youth Ministry',             30),
    ('EXP-MN-004', 'Women Fellowship',           40),
    ('EXP-MN-005', 'Special Programmes',         50),
    ('EXP-MN-006', 'Medical / Benevolence',      60),
    ('EXP-MN-007', 'Choir & Music',              70),
    ('EXP-MN-008', 'Retreat & Conference',       80),
    ('EXP-MN-009', 'Library & Literature',       90),
    ('EXP-MN-010', 'Hospitality & Refreshments', 100),
    ('EXP-MN-011', 'Cemetery / Burial Expenses', 110)
  ) AS v(code, name, so) WHERE p.code = 'EXP-MN'
  ON CONFLICT (code) DO NOTHING;

  -- Maintenance
  INSERT INTO chart_of_accounts (code, name, account_type, level, is_postable, parent_id, sort_order, entity_id)
  SELECT v.code, v.name, 'Expense', 3, true, p.id, v.so, v_eid
  FROM chart_of_accounts p, (VALUES
    ('EXP-MT-001', 'Electricity & Water',              10),
    ('EXP-MT-002', 'Building Maintenance',             20),
    ('EXP-MT-003', 'Furniture Repairs',                30),
    ('EXP-MT-004', 'Vehicle Maintenance',              40),
    ('EXP-MT-005', 'Travel & Conveyance',              50),
    ('EXP-MT-006', 'Security / Watchman',              60),
    ('EXP-MT-007', 'Generator & Fuel',                 70),
    ('EXP-MT-008', 'Computer & Equipment Maintenance', 80)
  ) AS v(code, name, so) WHERE p.code = 'EXP-MT'
  ON CONFLICT (code) DO NOTHING;

  -- Assign any remaining NULL entity_id rows to this entity
  UPDATE chart_of_accounts SET entity_id = v_eid WHERE entity_id IS NULL;

END $$;
