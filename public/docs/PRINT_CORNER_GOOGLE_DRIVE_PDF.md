# Print Corner — PDF via Google Drive / Docs

Convert filled Word letters to PDF using **Google Docs export** (no CloudConvert credits, no VM).

Uses the **same Google connection** as CMS Backup (`Connect Google` + Drive folder).

---

## Flow

```
Wizard field_values
  → Edge merges {tags} into .docx
  → Upload to Google Drive as Google Doc
  → Export as PDF
  → Delete temp Drive file
  → Save PDF to print-corner/issued/
```

Fallback (optional): if Google fails and `CLOUDCONVERT_API_KEY` is set, CloudConvert is tried (`PRINT_CORNER_PDF_ENGINE=auto`).

---

## Prerequisites (per church Supabase)

1. **Google Cloud** — Drive API enabled (same project as Backup OAuth).
2. Supabase secrets (already used by backup):

| Secret | Purpose |
|--------|---------|
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth secret |

3. CMS → **Backup** → **Connect Google** (stores refresh token in `cms_backup_settings`).
4. Save a **Drive folder ID** on Backup (temp Docs are created under this folder when set).
5. Redeploy Edge Function **`cms-print-corner`** with the latest code from the repo.

Optional:

| Secret | Purpose |
|--------|---------|
| `PRINT_CORNER_PDF_ENGINE` | `auto` (default) \| `google_drive` \| `cloudconvert` |
| `CLOUDCONVERT_API_KEY` | Fallback only |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Alt auth (Shared Drives); optional `PRINT_CORNER_DRIVE_FOLDER_ID` |

---

## Deploy function (manual Dashboard)

1. Supabase → **Edge Functions** → **cms-print-corner**
2. Paste `supabase/functions/cms-print-corner/index.ts`
3. Deploy

Or CLI:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\Deploy-PrintCornerFunction.ps1 -Target stpauls
```

---

## Test

1. Print Corner banner should say **PDF ready via Google Drive (you@…)**  
2. Recommendation letter → fill fields → **Issue PDF**  
3. PDF should show real names, not `{member_name}`  
4. Temp file should not remain in Drive (deleted after export)

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Google not ready | Backup → Connect Google; confirm OAuth secrets |
| `insufficient permissions` | Re-connect Google; ensure Drive API enabled |
| Layout slightly different | Normal for Docs export; adjust Word template if needed |
| Want CloudConvert only | Secret `PRINT_CORNER_PDF_ENGINE=cloudconvert` |

---

## Related

- Backup OAuth: `docs/GOOGLE_DRIVE_BACKUP_SETUP.md`
- Function source: `supabase/functions/cms-print-corner/index.ts`
