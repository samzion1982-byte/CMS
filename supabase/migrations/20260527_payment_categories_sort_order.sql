-- Set payment categories to the desired display order
UPDATE payment_categories SET sort_order = CASE name
  WHEN 'Subscription'             THEN 1
  WHEN 'Mens Fellowship'          THEN 2
  WHEN 'Womens Fellowship'        THEN 3
  WHEN 'Youth Association'        THEN 4
  WHEN 'Family Benefit Relief Fund' THEN 5
  WHEN 'Coffee Fellowship'        THEN 6
  WHEN 'Village Ministry'         THEN 7
  WHEN 'Special Projects'         THEN 8
  WHEN 'Pre School'               THEN 9
  WHEN 'Medical Aid'              THEN 10
  WHEN 'Diocesan Fostership Fund' THEN 11
  WHEN 'Missionary Support'       THEN 12
  WHEN 'Auction'                  THEN 13
  WHEN 'Other'                    THEN 14
  ELSE sort_order
END;
