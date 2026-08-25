# Print Corner — CloudConvert + Supabase Setup

Use this checklist for **each church Supabase project** (St Paul’s, demo, etc.).  
CloudConvert account is **one shared Zion account** — same API key everywhere.

---

## 1. CloudConvert (done once)

1. [cloudconvert.com](https://cloudconvert.com) → sign in  
2. **API → Authorization** → create key  
   - Name: `Zion CMS Print Corner`  
   - Scopes: `task.read`, `task.write` (+ optional `user.read`)  
3. Job Builder test: **engine = `office`**, no `pdf_a`, colors OK  
4. Store key in password manager — **never** commit to GitHub  

---

## 2. Run SQL migration

On **each** Supabase project:

1. Dashboard → **SQL Editor** → New query  
2. Paste contents of `supabase/migrations/20260830_print_corner.sql`  
3. **Run**  

Creates:

- Tables: `print_corner_categories`, `print_corner_templates`, `print_corner_drafts`, `print_corner_issued_log`  
- Storage bucket: `print-corner` (private)  
- Church columns: `presbyter_signature_url`, `secretary_signature_url`, `treasurer_signature_url`  
- Default template catalog (Certificates / Letters / Forms)  

Or via CLI (linked project):

```bash
supabase db push
```

---

## 3. Set Edge Function secret

Dashboard → **Project Settings** → **Edge Functions** → **Secrets**

| Name | Value |
|------|--------|
| `CLOUDCONVERT_API_KEY` | your production API key |

**CLI:**

```bash
cd C:\Projects\Church-CMS-React
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set CLOUDCONVERT_API_KEY=your-key-here
```

Same key on every church project.

---

## 4. Deploy Edge Function (from your PC)

Project is linked to **zion-cms-hub** (`pnkbiovspluyqcszgfyw`).

**One-time login** (opens browser):

```powershell
cd C:\Projects\Church-CMS-React
npm run supabase:login
```

**Deploy:**

```powershell
npm run supabase:deploy-print-corner
```

Or use the helper script (optional `-SetSecret -CloudConvertKey "..."`):

```powershell
.\deploy\Deploy-PrintCornerFunction.ps1
```

Verify in Dashboard → **Edge Functions** → `cms-print-corner` is listed.

### Optional: run function locally (`functions serve`)

Requires **Docker Desktop** (not installed on this machine yet).

1. Copy `supabase/functions/.env.example` → `supabase/functions/.env.local` and fill keys  
2. Start Docker Desktop  
3. `npx supabase start` (first time only)  
4. `npm run supabase:serve-print-corner`  

Function URL: `http://127.0.0.1:54321/functions/v1/cms-print-corner`  
Point the CMS at local Supabase only if you also run the app against `127.0.0.1:54321` — otherwise deploy to remote (above) and use production `VITE_SUPABASE_URL`.

---

## 5. Upload a test Word template

Dashboard → **Storage** → bucket **`print-corner`** → Upload:

```
templates/letters/recommendation/source.docx
```

(Optional) Update DB row:

```sql
UPDATE print_corner_templates
SET storage_path = 'templates/letters/recommendation/source.docx'
WHERE template_key = 'letter-recommendation';
```

---

## 6. Smoke test from CMS (after app update)

1. Log in to CMS → **Print Corner**  
2. **Test connection** — should show CloudConvert OK  
3. **Test convert** — uses template path above → PDF in `issued/letters/YYYY/`  

**Manual invoke (browser console while logged in):**

```javascript
const { data, error } = await supabase.functions.invoke('cms-print-corner', {
  body: {
    action: 'ping',
  },
})
console.log(data, error)
```

**Convert test:**

```javascript
const { data, error } = await supabase.functions.invoke('cms-print-corner', {
  body: {
    action: 'convert_storage',
    storage_path: 'templates/letters/recommendation/source.docx',
    template_key: 'letter-recommendation',
    template_type: 'letters',
    issue: true,
  },
})
console.log(data, error)
```

---

## 7. CloudConvert job settings (production)

Edge Function uses:

| Setting | Value |
|---------|--------|
| Engine | `office` (color letterhead) |
| Input | Signed URL to `.docx` in `print-corner` bucket |
| Output | PDF → `print-corner/issued/{type}/{year}/{date}_{time}_{name}.pdf` |
| Log | Row in `print_corner_issued_log` |

---

## 8. Backup sync

Add `print-corner` to backup (already in repo if you pulled latest):

- `cms-full-backup` → `KNOWN_BUCKETS` includes `print-corner`  
- Redeploy `cms-full-backup` on each Supabase after pull  

Issued PDFs are **kept forever** and sync to Google Drive under `cms-storage-sync/print-corner/`.

---

## 9. New church checklist

- [ ] Run migration `20260830_print_corner.sql`  
- [ ] Set `CLOUDCONVERT_API_KEY` secret (same key)  
- [ ] Deploy `cms-print-corner`  
- [ ] Upload church `.docx` templates under `print-corner/templates/...`  
- [ ] Upload signatures in Church Setup (when UI is live)  
- [ ] Grant **Print Corner** in CMS Permissions  

**Do not** create a new CloudConvert account per church.

---

## 10. Troubleshooting

| Issue | Fix |
|-------|-----|
| `CLOUDCONVERT_API_KEY secret not set` | Step 3 |
| `Not authenticated` | User must be logged in; invoke includes session JWT |
| PDF black & white | Use `engine: office` (already default in Edge Function) |
| `storage_path must be under templates/` | Only template paths allowed for convert action |
| Out of credits | CloudConvert Dashboard → credits; free ≈ 5 Word PDFs/day |
| Function not found | Redeploy `cms-print-corner` |

---

## Related files

| Path | Purpose |
|------|---------|
| `supabase/functions/cms-print-corner/index.ts` | Edge Function |
| `supabase/migrations/20260830_print_corner.sql` | Schema + bucket |
| `src/lib/printCornerLib.js` | Client helpers |
| `docs/PRINT_CORNER_ORACLE_GOTENBERG_SETUP.md` | Optional Oracle path (not needed with CloudConvert) |
