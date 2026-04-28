# Quick Setup Checklist - Delete/Restore Functionality

## ⚠️ IMPORTANT: Before Testing Delete/Restore

The delete and restore features require a **Database Migration** to be run first. Without this, the delete button will fail silently.

---

## ✅ Pre-Deployment Checklist

### Step 1: Run the Database Migration
- [ ] Open Supabase Dashboard → SQL Editor
- [ ] Copy the entire content of `MIGRATION_DELETED_MEMBERS.sql`
- [ ] Paste into SQL Editor and click "Run"
- [ ] Verify no errors (all green checkmarks)
- [ ] Check that these are created:
  - `deleted_members` table
  - `move_member_to_deleted()` function
  - `restore_member_from_deleted()` function
  - RLS policies

### Step 2: Verify Migration Success
Run this query in SQL Editor to confirm:
```sql
-- Should return the deleted_members table structure
SELECT * FROM deleted_members LIMIT 0;

-- Should return function info
SELECT routine_name FROM information_schema.routines 
WHERE routine_name IN ('move_member_to_deleted', 'restore_member_from_deleted');
```

### Step 3: Add Route to App.jsx
Find your routing configuration and add:
```jsx
import DeletedMembersPage from './pages/DeletedMembersPage'

// In your routes array/config:
{
  path: '/deleted-members',
  element: <DeletedMembersPage />,
}
```

### Step 4: Test Delete Functionality
- [ ] Go to a member record
- [ ] Click "Delete" button
- [ ] Modal should appear (now with proper z-index)
- [ ] Enter a deletion reason
- [ ] Verify "Delete Member" button is clickable (not grayed out)
- [ ] Click "Delete Member"
- [ ] Should see success message
- [ ] Member should disappear from active list
- [ ] Go to `/deleted-members` to verify it's in archive

---

## 🐛 If Delete Button Still Doesn't Work

### Issue: Delete button is grayed out
**Fix**: Make sure you entered a reason in the textarea

### Issue: Nothing happens when clicking Delete
**Steps to debug:**
1. Open browser Developer Tools (F12)
2. Go to Console tab
3. Try deleting a member again
4. Look for error messages starting with `[deleteMember]`
5. Common errors:
   - `Database error: relation "deleted_members" does not exist` → Run the migration SQL
   - `Database error: function move_member_to_deleted does not exist` → Run the migration SQL
   - Permission denied → Check user role (must be admin or super_admin)

### Issue: Modal still hidden behind header
**Already fixed** in the latest update:
- Changed z-index to `z-[9999]`
- Added scroll support with `overflow-y-auto`
- Added proper spacing with `my-8 p-4`

---

## 📋 File Structure

```
c:\Projects\Church-CMS-React\
├── MIGRATION_DELETED_MEMBERS.sql        ← Run this first!
├── DELETE_RESTORE_IMPLEMENTATION.md     ← Full documentation
├── src/
│   ├── lib/
│   │   └── memberDelete.js              ← Core delete/restore functions
│   └── pages/
│       ├── MembersPage.jsx              ← Updated with DeleteMemberModal
│       ├── DeleteMemberModal.jsx        ← Delete confirmation dialog
│       ├── RestoreMemberModal.jsx       ← Restore dialog
│       └── DeletedMembersPage.jsx       ← Deleted members archive view
```

---

## 🔍 Testing Checklist

### Test 1: Basic Delete
- [ ] Member record visible in list
- [ ] Click Delete button
- [ ] Modal shows (not hidden behind header)
- [ ] Can enter deletion reason
- [ ] Delete button is clickable
- [ ] Click Delete → success message
- [ ] Member gone from active list

### Test 2: Archive View
- [ ] Go to `/deleted-members`
- [ ] Deleted member visible in list
- [ ] Shows deletion date and reason
- [ ] Shows who deleted it

### Test 3: Restore
- [ ] Go to `/deleted-members`
- [ ] Click Restore button
- [ ] Modal shows member details
- [ ] Option to restore with original ID
- [ ] Click Restore → success message
- [ ] Member back in active list
- [ ] Photo restored

### Test 4: Permission Check
- [ ] Log in as regular user
- [ ] Delete button should not appear
- [ ] Trying to access `/deleted-members` shows "Access Denied"

---

## 📞 If You Still Have Issues

Check the browser console (F12 → Console) for errors starting with `[deleteMember]` or `[restoreMember]`.

The error message will tell you what's wrong:
- **"relation does not exist"** → Run the migration
- **"Permission denied"** → Check your user role
- **"Member not found"** → Member ID might be wrong
- **"ID already exists"** → Can't use that member ID
