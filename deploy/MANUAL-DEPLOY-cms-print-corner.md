# Manual deploy: cms-print-corner

## Source file (copy from here)

```
C:\Projects\Church-CMS-React\supabase\functions\cms-print-corner\index.ts
```

- **Lines:** ~2009
- **Single file** — no other files in this function folder

## Verify you have the NEW version

Search the file for these strings (must exist):

- `docx_replace_anchor` ✅
- `signatureDrawingAnchorXml` ✅
- `overwrite_placeholder` ✅
- `:reuse_rel` ✅

Must **NOT** exist:

- `docx_retarget_anchor` ❌ (old broken code)

## Deploy on Supabase Dashboard

Do this on **both** projects:

| Church   | Project ref              | Dashboard |
|----------|--------------------------|-----------|
| St Pauls | `wjasjrthijpxlarreics`   | https://supabase.com/dashboard/project/wjasjrthijpxlarreics/functions |
| Zion Hub | `pnkbiovspluyqcszgfyw`    | https://supabase.com/dashboard/project/pnkbiovspluyqcszgfyw/functions |

### Steps

1. Open **Edge Functions** → **cms-print-corner**
2. Open the code editor for `index.ts`
3. **Select all** → delete → **paste** full contents from local `index.ts`
4. Click **Deploy** / **Save**
5. Confirm **Last updated** is today

## After deploy — smoke test

1. Log into CMS → Print Corner
2. Issue a letter PDF
3. Toast should say e.g.:
   `presbyter_sign:docx_replace_anchor:rId12:reuse_rel`
   (NOT `docx_retarget_anchor`)

## Secrets (already on project — do not paste in code)

These stay in Supabase project settings / secrets:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (auto)
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (for Google PDF)

No code changes needed for secrets when only updating `index.ts`.
