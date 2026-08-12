# Google Drive Backup — Complete Setup Guide (New Church)

Use this checklist every time you set up Backup & Restore for a new church CMS project.

**Who can connect / run backups:** Super Admin only (`/backup`).

**What you will end up with**
- Google Cloud project + Drive API + OAuth client (free / no credit card)
- Two Supabase Edge Functions: `cms-google-oauth`, `cms-full-backup`
- SQL migrations on that church’s Supabase
- CMS Backup page: **Connect Google** + Drive **folder ID**
- Backups land in Google Drive; storage files sync under `cms-storage-sync/`

---

## Overview (order of work)

1. Create a **card-free** Google Cloud project  
2. Enable **Google Drive API**  
3. Configure **OAuth consent screen** + **Test users**  
4. Create **OAuth Client ID** (Web) + redirect URI  
5. Deploy Supabase Edge Functions + set secrets  
6. Run backup SQL migrations  
7. Connect Google from CMS Backup page  
8. Create / pick a Drive folder and save Folder ID  
9. First backup smoke test  

---

## Step 1 — Create a card-free Developer project

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Log in with a normal Google account.
3. **Do not** click “Try for free” / “Start trial” (those ask for a credit card). You only need APIs that work on the free tier for this setup.
4. Top bar → **Select a project** → **New Project**.
5. Name it (example: `CSITA St Pauls CMS Backup`) → **Create**.
6. Make sure that project is selected in the top bar.

> Tip: One Google Cloud project can serve several church websites if you add **each site’s redirect URI** to the same OAuth client. Or create one project per church — both work.

---

## Step 2 — Enable the Google Drive API

1. In the top search bar, type **Google Drive API** and open it.
2. Click the blue **Enable** button.
3. Wait until it shows as enabled for this project.

(Optional but useful later) Also search and enable **Google People API** / ensure userinfo email works — our OAuth requests `userinfo.email`. Drive API + standard OAuth userinfo is usually enough.

---

## Step 3 — OAuth consent screen (Audience / Test users)

1. Google Cloud Console → **APIs & Services** → **OAuth consent screen**.
2. Choose **External** (unless the church is strictly Google Workspace Internal and you know that path).
3. Fill required fields:
   - **App name:** e.g. `Church CMS Backup`
   - **User support email:** your Google account
   - **Developer contact email:** your Google account
4. **Scopes** — add (or confirm when creating the client; the app requests these):
   - `https://www.googleapis.com/auth/drive.file`  
     *(files created/opened by this app only — recommended)*
   - `https://www.googleapis.com/auth/userinfo.email`
5. **Audience / Publishing status**
   - Leave app in **Testing** while setting up.
   - Under **Test users**, click **Add users** and add:
     - The Super Admin Gmail that will click **Connect Google**
     - Any other accounts that must authorize Drive for this church
6. Save.

> While status is **Testing**, only listed **Test users** can complete OAuth.  
> “App not verified” / “Access blocked” usually means the Google account is **not** in Test users.

---

## Step 4 — Create OAuth Client ID (Web application)

1. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
2. Application type: **Web application**.
3. Name: e.g. `CMS Backup Web`.
4. **Authorized JavaScript origins** (optional but good):
   - Production site origin, e.g. `https://cms-three-mu.vercel.app`  
   - Local/dev if needed: `http://localhost:5173`
5. **Authorized redirect URIs** — **must match exactly** (trailing slash matters):

   ```
   https://YOUR-CHURCH-SITE/backup/google-callback
   ```

   Examples:
   - `https://cms-three-mu.vercel.app/backup/google-callback`
   - `http://localhost:5173/backup/google-callback` (local only)

6. Click **Create**.
7. Copy and store securely (paste these into Supabase Edge Function secrets):
   - **Client ID** → secret name `GOOGLE_OAUTH_CLIENT_ID`  
     Sample look: `123456789012-abcdefghijklmnop.apps.googleusercontent.com`
   - **Client secret** → secret name `GOOGLE_OAUTH_CLIENT_SECRET`  
     Sample look: `GOCSPX-abcdefghijklmnopqrstuvwx`

> The CMS builds the redirect as: `{window.location.origin}/backup/google-callback`  
> You can also copy the exact URI from Backup page (Google Drive section).

---

## Step 5 — Supabase: create Edge Functions

In the **church’s** Supabase project (Dashboard → Edge Functions):

### 5A. Function `cms-google-oauth`

1. Create function named **`cms-google-oauth`**.
2. Paste source from the repo:  
   `supabase/functions/cms-google-oauth/index.ts`
3. Deploy.

**What it does**
- Builds Google auth URL  
- Exchanges code for refresh token  
- Stores token on `cms_backup_settings` (server-side only)  
- Actions: `auth_url`, `exchange`, `disconnect`, `status`

### 5B. Function `cms-full-backup`

1. Create function named **`cms-full-backup`**.
2. Paste latest source from the repo (or deploy artifact):  
   - Repo: `supabase/functions/cms-full-backup/index.ts`  
   - Agent artifact (when available): `/opt/cursor/artifacts/cms-full-backup-index.ts`
3. Deploy.

**What it does**
- Complete backup: all selected tables → `database.json` in a dated Drive folder  
- Storage: incremental sync under parent folder `cms-storage-sync/<bucket>/…`  
- Restore, inspect, chunked continue, list_sources, version probe  

**Expected version after deploy:** `7` with `storage_sync` / `storage_sync_prune` (Drive is an **exact mirror** of selected Supabase storage buckets: upload new/changed files and **prune** files deleted from Supabase).

---

## Step 6 — Supabase secrets (Edge Function secrets)

In Supabase → **Project Settings** → **Edge Functions** → **Secrets** (or CLI `supabase secrets set`), set:

| Secret name (exact) | What to paste | Sample / how it looks |
|---------------------|---------------|------------------------|
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth **Client ID** from Step 4 | `123456789012-abcdefghijklmnop.apps.googleusercontent.com` |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth **Client secret** from Step 4 | `GOCSPX-abcdefghijklmnopqrstuvwx` |

**Easy identification**
- **Client ID** is long, ends with `.apps.googleusercontent.com`
- **Client secret** is shorter and usually starts with `GOCSPX-`

Example when setting via CLI:

```bash
supabase secrets set \
  GOOGLE_OAUTH_CLIENT_ID="123456789012-abcdefghijklmnop.apps.googleusercontent.com" \
  GOOGLE_OAUTH_CLIENT_SECRET="GOCSPX-abcdefghijklmnopqrstuvwx"
```

(Replace with your real values from Google Cloud → Credentials → your OAuth client.)

Also ensure the functions have normal Supabase runtime env (usually automatic):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (used for restore auth checks)

> Do **not** put Client Secret in the frontend / Vercel env. Only Edge Function secrets.

Redeploy both functions after setting secrets if the platform requires it.

---

## Step 7 — Run SQL migrations (church Supabase SQL editor)

Run these (in order if not already applied), from `supabase/migrations/`:

| Migration | Purpose |
|-----------|---------|
| `20260809_cms_backup_page_v2.sql` | Backup settings / page base |
| `20260809_cms_backup_snapshot.sql` | Snapshot support |
| `20260809_cms_backup_google_oauth.sql` | Google refresh token columns |
| `20260809_cms_backup_log_delete.sql` | Clear history helpers |
| `20260809_cms_complete_backup.sql` | `cms_list_public_tables`, `cms_truncate_tables` (restore) |
| `20260809_cms_backup_progress.sql` | Running status + progress % |
| `20260809_cms_backup_selection.sql` | Saved table/bucket selection for auto backups |

If a column already exists, `IF NOT EXISTS` migrations are safe to re-run.

---

## Step 8 — Point the website at this church’s Supabase

Confirm the live site (or church URL) uses this project’s:
- Supabase URL  
- Anon key  

Super Admin must be able to open **Backup & Restore** (`/backup`).

---

## Step 9 — Connect Google from CMS

1. Log in as **Super Admin**.
2. Open **Backup & Restore**.
3. Section **Google Drive** → click **Connect Google**.
4. Google consent screen appears → choose the Test user account → Allow.
5. Browser returns to `/backup/google-callback`, then redirects to Backup.
6. Status should show **Google connected** with the account email.

### If Connect fails

| Symptom | Fix |
|---------|-----|
| Access blocked / app not verified | Add that Gmail under **Test users** |
| redirect_uri_mismatch | Redirect URI in Google Cloud must match site exactly |
| No refresh_token | Revoke app at [Google Account permissions](https://myaccount.google.com/permissions), Connect again (we request `prompt=consent` + offline) |
| Function error about secrets | Set `GOOGLE_OAUTH_*` secrets and redeploy `cms-google-oauth` |
| Not Super Admin | Only `super_admin` role can connect |

---

## Step 10 — Create Drive folder and save Folder ID

1. In [Google Drive](https://drive.google.com) (same connected account), create a folder, e.g. `CMS Backups – St Pauls`.
2. Open the folder. Copy the **Folder ID** from the URL:

   ```
   https://drive.google.com/drive/folders/XXXXXXXXXXXXXXXXXXXXXXXX
                                         └────── Folder ID ──────┘
   ```

3. On Backup page → paste into **Drive folder ID** → **Save folder ID**.
4. Status should become **Ready for Drive backups**.

### What appears in that folder after backups

| Path | Contents |
|------|----------|
| `cms-full-backup-YYYYMMDD-HHMMSSZ/` (or snapshot name) | Dated run: `database.json`, `manifest.json` |
| `cms-storage-sync/<bucket>/…` | Incremental storage sync (all buckets) |
| `cms-storage-sync/sync-index.json` | Index of synced files (path + size + Drive file id) |

Storage sync uploads **only new/changed** files after the first full sync. Deleted local files are **not** removed from Drive (kept for recovery).

---

## Step 11 — Verify connection

1. Backup page → **Google Drive** shows **Google connected** with your email.
2. Folder ID is saved and status says **Ready for Drive backups**.
3. Optional: open Supabase Edge Function logs after clicking Connect / Run Backup if something fails.

---

## Step 12 — First backup & restore smoke test

1. **Run Complete Full Backup** (or Snapshot).
2. Chooser: pick tables + storage buckets (or Select all).  
   Optionally **Save this selection for automatic backups**.
3. Watch progress bar; storage may continue in chunks (normal).
4. In Drive, confirm dated folder + `cms-storage-sync/` activity.
5. Optional: **Restore** from a history row — choose items carefully (tables are truncated then reloaded). Storage restore is incremental (skips unchanged files).

---

## Automatic backups (optional)

On Backup page, enable:
- Full auto (hour IST) and/or Snapshot auto  

Automatic runs use the **saved backup selection** (tables + buckets). Cron must invoke `cms-full-backup` with service role / scheduled trigger as you already configure for that church.

---

## Architecture reminder (why OAuth, not service account)

- Personal Google Drive **does not** give storage quota to service accounts.
- OAuth stores a **refresh token** for the connected user; uploads use **that user’s Drive space**.
- Scope `drive.file` limits access to files/folders the app creates or the user opens with the app.

---

## Quick checklist (print / copy per church)

- [ ] Google Cloud project created (no billing trial required)  
- [ ] Google Drive API enabled  
- [ ] OAuth consent screen External + app name / emails  
- [ ] Test user(s) added (Super Admin Gmail)  
- [ ] OAuth Web client + redirect `https://SITE/backup/google-callback`  
- [ ] Client ID + Secret copied  
- [ ] Edge Function `cms-google-oauth` deployed  
- [ ] Edge Function `cms-full-backup` deployed (v5+)  
- [ ] Secrets `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` set  
- [ ] Backup SQL migrations run  
- [ ] Connect Google succeeds on `/backup`  
- [ ] Drive folder created + Folder ID saved  
- [ ] First Full Backup completed  

---

## Source files in this repo

| Piece | Path |
|-------|------|
| OAuth Edge Function | `supabase/functions/cms-google-oauth/index.ts` |
| Backup/Restore Edge Function | `supabase/functions/cms-full-backup/index.ts` |
| Backup UI | `src/pages/BackupPage.jsx` |
| OAuth callback page | `src/pages/GoogleDriveCallbackPage.jsx` |
| Client helpers | `src/lib/cmsFullBackup.js` |
| Migrations | `supabase/migrations/20260809_cms_backup_*.sql`, `20260809_cms_complete_backup.sql` |

---

*Last aligned with CMS complete backup version 5 (all storage buckets incremental sync).*
