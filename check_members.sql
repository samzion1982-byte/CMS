-- Check member status breakdown
SELECT 
  COUNT(*) as total_members,
  COUNT(CASE WHEN is_active = true THEN 1 END) as active_members,
  COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_members,
  COUNT(CASE WHEN is_active IS NULL THEN 1 END) as null_status_members
FROM members;

-- To see which members are inactive
SELECT member_id, member_name, is_active, created_at 
FROM members 
WHERE is_active = false OR is_active IS NULL
LIMIT 20;
