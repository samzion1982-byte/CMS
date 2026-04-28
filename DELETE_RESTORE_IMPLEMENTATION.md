# Member Delete & Restore Implementation Guide

## ✅ What's Been Implemented

### Database Layer (SQL)
- **`deleted_members` table**: Complete archive with same schema as members table
- **Deletion Metadata**: `deleted_at`, `deleted_reason`, `deleted_by`, `original_id`
- **Restoration Metadata**: `restored_at`, `restored_by`, `restored_member_id`
- **RLS Policies**: Only Super Admin & Admin can access/restore
- **Utility Functions**:
  - `move_member_to_deleted()` - Archives a member with metadata
  - `restore_member_from_deleted()` - Restores with optional member ID change

### React Components
1. **DeleteMemberModal.jsx** - Delete confirmation dialog
   - Shows member info for confirmation
   - Requires deletion reason (mandatory)
   - Option to move photo to archive
   - Calls `deleteMember()` function

2. **RestoreMemberModal.jsx** - Restore with optional member ID change
   - Shows deleted member details
   - Option to restore with original ID or new ID
   - Validates that new ID doesn't already exist
   - Shows availability status for new ID

3. **DeletedMembersPage.jsx** - Admin archive view
   - Paginated list of deleted members
   - Search by ID, name, or mobile
   - Shows deletion date, reason, and who deleted
   - One-click restore button
   - Only accessible to Super Admin & Admin

### Utility Functions (memberDelete.js)
- `deleteMember(memberId, reason, userEmail)` - Archives member + moves photo
- `restoreMember(deletedMemberId, newMemberId, userEmail)` - Restores member + moves photo back
- `fetchDeletedMembers(page, limit, searchVal)` - Paginated deleted member list
- `checkMemberIdAvailable(memberId)` - Validates ID availability
- `movePhotoToDeleted(memberId)` - Moves photo from active to deleted folder
- `movePhotoToActive(memberId)` - Restores photo from deleted to active folder

---

## 🚀 Deployment Steps

### 1. Run the Database Migration
```sql
-- In Supabase SQL Editor, run the entire MIGRATION_DELETED_MEMBERS.sql file
-- This creates:
--   - deleted_members table
--   - RLS policies for admins only
--   - move_member_to_deleted() function
--   - restore_member_from_deleted() function
```

### 2. Update App Routing
Add route to show the deleted members archive in your router (likely `App.jsx` or routing config):

```jsx
import DeletedMembersPage from './pages/DeletedMembersPage'

// In your route configuration:
{
  path: '/deleted-members',
  element: <DeletedMembersPage />,
  // Restrict access to admin/super_admin in permissions check
}
```

### 3. Add Navigation Link (Optional)
Add link to deleted members in admin sidebar/menu:

```jsx
// In Header, Sidebar, or admin menu:
{profile?.role === 'super_admin' || profile?.role === 'admin' ? (
  <a href="/deleted-members" className="btn btn-secondary">
    <Archive size={16} />
    Deleted Members ({deletedCount})
  </a>
) : null}
```

---

## 🔐 Permission Model

| Action | Super Admin | Admin | User | Demo |
|--------|-------------|-------|------|------|
| Delete Member | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| View Deleted Members | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| Restore Member | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| Change Member ID on Restore | ✅ Yes | ✅ Yes | ❌ No | ❌ No |

---

## 📋 Database Schema: deleted_members

### Key Columns
```sql
id                  uuid          -- Unique identifier
member_id           text          -- Original member ID
member_name         text          -- Full name (from original)
deleted_at          timestamptz   -- When deleted (default: now())
deleted_reason      text          -- Why deleted (required)
deleted_by          text          -- Email of admin who deleted
original_id         uuid          -- Reference to original member record
restored_at         timestamptz   -- When restored (NULL if not restored)
restored_by         text          -- Email of admin who restored
restored_member_id  text          -- New member ID if changed during restore
```

Plus all original member columns (family_id, gender, dob, mobile, etc.)

---

## 🔄 Delete Workflow

```
User deletes member
  ↓
DeleteMemberModal opens
  - Shows member details
  - Requires deletion reason
  - Option to move photo
  ↓
User confirms → deleteMember() called
  ↓
Database transaction:
  1. Copy all member data → deleted_members table
  2. Add deletion metadata (reason, deleted_by, timestamp)
  3. Delete from members table
  ↓
Photos:
  - Move: member-photos/active/{id}.jpg → member-photos/deleted/{id}.jpg
  ↓
Success message → Reload list
```

---

## 🔄 Restore Workflow

```
Admin views deleted members
  ↓
Clicks "Restore" on a deleted member
  ↓
RestoreMemberModal opens
  - Shows original member ID
  - Option to assign new ID
  - If new ID: validate it doesn't exist
  ↓
Admin confirms → restoreMember() called
  ↓
Database transaction:
  1. Get deleted_members record
  2. Insert back to members table (with original or new ID)
  3. Mark as restored in deleted_members (restored_at, restored_by, restored_member_id)
  ↓
Photos:
  - Move: member-photos/deleted/{id}.jpg → member-photos/active/{id}.jpg
  ↓
Success message → Reload list
```

---

## 🧪 Testing Scenarios

### Scenario 1: Basic Delete
1. Open a member record (e.g., "FAM-0001-001")
2. Click Delete button
3. Enter deletion reason (e.g., "Duplicate record")
4. Check photo checkbox
5. Confirm
6. Verify member is gone from active list
7. Check deleted members archive (should appear with reason & timestamp)

### Scenario 2: Restore with Original ID
1. Go to Deleted Members page
2. Find the member you deleted
3. Click Restore
4. Select "Restore with original ID"
5. Confirm
6. Verify member is back in active list
7. Verify photo is restored to active folder

### Scenario 3: Restore with Changed ID
1. Go to Deleted Members page
2. Find a member to restore
3. Click Restore
4. Select "Assign new member ID"
5. Enter new ID (e.g., "FAM-0099-001")
6. Click "Check" → should show "ID is available"
7. Confirm restore
8. Verify member restored with new ID
9. Verify old record still in deleted_members with restored_member_id set

### Scenario 4: Try to Restore with Taken ID
1. Go to Deleted Members page
2. Click Restore on member
3. Enter an ID that exists (either in active or deleted)
4. Click Check → should show error "ID already exists"
5. Button should be disabled
6. Try another ID

### Scenario 5: Photo Conflict on Delete
1. Delete a member with photo
2. Manually move photo back to active folder (for testing)
3. Try to delete same member again
4. Should handle gracefully (either skip or overwrite)

### Scenario 6: Permission Check
1. Log in as regular user
2. Try to access `/deleted-members` → should show "Access Denied"
3. Try to delete a member → delete button not visible
4. Log in as Admin → should have full access

---

## ⚠️ Important Notes

### Photo Handling
- Photos are stored in Supabase Storage under `member-photos` bucket
- Two folders: `active/` and `deleted/`
- Move operations use download → upload → delete pattern
- **If photo doesn't exist**: Operation continues gracefully (no error)
- **If photo already exists in destination**: Will be overwritten

### Member Statistics
- Delete operations do NOT update member statistics automatically
- You need to refetch statistics after delete/restore
- Dashboard statistics already filter `is_active = true`, so deleted members won't show up
- **Check**: Verify the `check_members.sql` file excludes deleted members from stats

### Audit Trail
- All deletions are logged with:
  - `deleted_by` (email of admin)
  - `deleted_at` (timestamp)
  - `deleted_reason` (reason text)
- All restorations are logged with:
  - `restored_by` (email of admin)
  - `restored_at` (timestamp)
  - `restored_member_id` (if ID was changed)

### Data Recovery
- Deleted members are **NEVER permanently deleted** until manually purged from deleted_members table
- RLS policies prevent non-admin access to deleted records
- Original member UUID preserved in `original_id` column if needed

---

## 🔧 Troubleshooting

### Issue: "Database error: Permission denied"
- **Cause**: User role not recognized as admin
- **Fix**: Verify user has `admin` or `super_admin` role in profiles table

### Issue: Photo not moving
- **Cause**: Photo doesn't exist or storage bucket misconfigured
- **Fix**: Check Supabase Storage bucket name and paths match `memberDelete.js`

### Issue: Restore fails with "Member ID already exists"
- **Cause**: ID is still in either members or deleted_members table
- **Fix**: Use "Assign new member ID" option during restore

### Issue: Member appears in both active and deleted
- **Cause**: Database transaction failed mid-operation
- **Fix**: Manually delete from one table (should not happen with proper RLS)

---

## 📦 Related Files
- **Database**: `MIGRATION_DELETED_MEMBERS.sql`
- **Functions**: `src/lib/memberDelete.js`
- **Components**: 
  - `src/pages/DeleteMemberModal.jsx`
  - `src/pages/RestoreMemberModal.jsx`
  - `src/pages/DeletedMembersPage.jsx`
- **Updated**: `src/pages/MembersPage.jsx` (uses DeleteMemberModal)

---

## Next Steps
1. ✅ Run the migration SQL in Supabase
2. ⏳ Add `/deleted-members` route to App.jsx
3. ⏳ Test all scenarios above
4. ⏳ Update dashboard statistics filter if needed
5. ⏳ Add admin menu link to deleted members page
