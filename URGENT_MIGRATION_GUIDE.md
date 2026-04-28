# 🚨 URGENT: Run Database Migration Now!

## The Error You're Seeing
```
Could not find the function public.move_member_to_deleted(...) in the schema cache
```

**This means the database migration hasn't been run yet.** The delete functionality requires database functions that don't exist.

---

## ✅ Step-by-Step: Run the Migration

### Step 1: Open Supabase Dashboard
- Go to: https://supabase.com/dashboard/project/wjasjrthijpxlarreics
- Login with your credentials

### Step 2: Open SQL Editor
- Click **"SQL Editor"** in the left sidebar
- Click **"New Query"** button

### Step 3: Copy the Migration SQL
- Open file: `c:\Projects\Church-CMS-React\MIGRATION_DELETED_MEMBERS.sql`
- Copy the **entire content** (Ctrl+A, Ctrl+C)

### Step 4: Paste and Run
- Paste into the SQL Editor
- Click **"Run"** button (or press Ctrl+Enter)

### Step 5: Verify Success
You should see:
- ✅ Green checkmarks for each statement
- ✅ No red error messages
- ✅ "Success" message at the bottom

---

## 🔍 Verify Migration Worked

After running, test these queries in SQL Editor:

### Test 1: Check table exists
```sql
SELECT * FROM deleted_members LIMIT 0;
```
**Expected:** Column headers appear (no error)

### Test 2: Check functions exist
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('move_member_to_deleted', 'restore_member_from_deleted');
```
**Expected:** Returns 2 rows with function names

### Test 3: Check RLS policies
```sql
SELECT schemaname, tablename, policyname FROM pg_policies
WHERE tablename = 'deleted_members';
```
**Expected:** Returns 3 policies (select, update, insert)

---

## 🧪 Test Delete Functionality

After migration succeeds:

1. **Refresh your browser** (Ctrl+F5)
2. Go to a member record
3. Click **"Delete"** button
4. Enter reason: "Test deletion"
5. Click **"Delete Member"**
6. Should see: ✅ "Member D01703 deleted successfully"

---

## 📞 If Migration Still Fails

### Common Issues:

**Issue: "Table already exists"**
- The migration is safe to run multiple times
- It uses `CREATE TABLE` (will fail if table exists)
- Change to `CREATE TABLE IF NOT EXISTS` if needed

**Issue: "Function already exists"**
- Safe to ignore - functions can be replaced
- Or drop them first: `DROP FUNCTION IF EXISTS move_member_to_deleted;`

**Issue: Permission denied**
- Make sure you're logged in as project owner/admin
- Check your Supabase role permissions

---

## 📋 What the Migration Creates

```
✅ deleted_members table (same schema as members)
✅ move_member_to_deleted() function
✅ restore_member_from_deleted() function
✅ RLS policies (admin/super_admin only)
✅ Indexes for performance
```

---

## 🚀 After Migration Success

The delete functionality will work immediately. Try deleting a member and you should see it move to the archive table instead of this error.

**Need help?** Share the exact error message from Supabase SQL Editor if it fails.