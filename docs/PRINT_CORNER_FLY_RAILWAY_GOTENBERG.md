# Print Corner — Gotenberg on Fly.io or Railway

Use this when you want **ATM 35 / embedded Tamil fonts** in rental PDFs without an Oracle VM.

**Reality check (2026):** Neither Fly nor Railway offers a **permanent free** always-on container with **1 GB RAM** (what LibreOffice needs). Budget **~$5–8/month** after trial, or use Google Drive + Noto Sans Tamil for ₹0.

---

## Why not Google Drive?

Google Docs export **replaces** custom fonts (e.g. ATM 35) even when embedded in `.docx`. Gotenberg uses **LibreOffice** on your server — much better for embedded fonts + optional ATM 35 install.

Edge function `cms-print-corner` already supports Gotenberg when these secrets are set:

| Secret | Example |
|--------|---------|
| `GOTENBERG_URL` | `https://print-corner-gotenberg.fly.dev` |
| `GOTENBERG_API_KEY` | long random hex |
| `PRINT_CORNER_PDF_ENGINE` | `auto` (Word → Gotenberg if URL set) |

---

## Fly.io vs Railway (for Gotenberg)

| | **Fly.io** | **Railway** |
|---|------------|-------------|
| **Permanent free tier** | No (trial ~7 days / 2 VM-hours) | No ($1/mo credit on Free plan — **0.5 GB RAM max**) |
| **Practical minimum RAM** | 1 GB (~$5–6/mo always-on) | 1 GB on Hobby $5/mo (+ usage) |
| **LibreOffice fit** | ✅ 1 GB works (slow under load) | ✅ 1 GB on Hobby+ |
| **0.5 GB free** | ❌ OOM / unreliable | ❌ Too small for LibreOffice |
| **Credit card** | Required after trial | Trial optional; Hobby needs card |
| **HTTPS** | Built-in (`*.fly.dev`) | Built-in |
| **Cold start** | Optional `auto_stop` (saves $, slow first PDF) | Services sleep when idle on low plans |
| **India latency** | Region `bom` (Mumbai) | Closest region in dashboard |
| **Deploy** | `flyctl` + Dockerfile | Git push / Dockerfile |
| **Best for** | One small always-on converter | Same, if you already use Railway |

**Verdict:** For church PDF volume (low–medium), **Fly.io 1 GB in `bom`** or **Railway Hobby with 1 GB** are both fine. Skip “free tier” expectations — **~$5/month shared across all churches** is the realistic target.

---

## Option A — Fly.io (recommended if ok with CLI)

### 1. Prerequisites

- [flyctl](https://fly.io/docs/hands-on/install-flyctl/) installed
- Fly account (trial, then add card for always-on)
- ATM 35 `.ttf` in `infra/print-corner-gotenberg/fonts/`

### 2. Deploy

```powershell
cd C:\Projects\Church-CMS-React\infra\print-corner-gotenberg

# Copy ATM35.ttf into fonts\ first

fly launch --no-deploy --copy-config --name print-corner-gotenberg --region bom
# Use Dockerfile.fly when prompted

fly secrets set GOTENBERG_API_KEY=(openssl rand -hex 32)
fly deploy
```

Note the URL: `https://print-corner-gotenberg.fly.dev`

### 3. Supabase (each church project)

```powershell
supabase secrets set GOTENBERG_URL=https://print-corner-gotenberg.fly.dev
supabase secrets set GOTENBERG_API_KEY=your-same-key-as-fly-secrets
supabase secrets set PRINT_CORNER_PDF_ENGINE=auto
```

Redeploy `cms-print-corner`.

### 4. Test

```powershell
curl.exe -X POST "https://print-corner-gotenberg.fly.dev/forms/libreoffice/convert" `
  -H "X-Gotenberg-Key: YOUR_KEY" `
  -F "files=@C:\path\to\rental-test.docx" -o test.pdf
```

### 5. Cost tips

- `fly.toml` sets **1 GB RAM** — required for LibreOffice.
- `min_machines_running = 0` + `auto_stop` → cheaper, but **first Issue PDF after idle may take 30–60s**.
- For production: `min_machines_running = 1` (~$5–6/mo).

---

## Option B — Railway

1. New project → **Deploy from GitHub** or `railway up` from `infra/print-corner-gotenberg/`.
2. Use `Dockerfile.fly` (same image: Gotenberg + Caddy gate on port 8080).
3. Set service **RAM to 1 GB** (Hobby plan — Free 0.5 GB is not enough).
4. Variables: `GOTENBERG_API_KEY`, `PORT=8080`.
5. Copy public URL → Supabase secrets (same as Fly).

Railway Hobby: **$5/month** includes $5 usage credit — a single 1 GB service often fits inside that.

---

## ATM 35 font

1. Put licensed `ATM35.ttf` (or your exact filename) in `infra/print-corner-gotenberg/fonts/`.
2. Rebuild / redeploy (`fly deploy` or Railway redeploy).
3. In Word: **File → Options → Save → Embed fonts in the file**.

LibreOffice uses **embedded font from docx** and/or **system font** if installed in the image.

---

## When to stay on Google Drive (₹0)

- Tamil “close enough” with **Noto Sans Tamil** / Latha in the template.
- No server budget and no card for Fly/Railway.

---

## Related files

| Path | Purpose |
|------|---------|
| `infra/print-corner-gotenberg/Dockerfile.fly` | Gotenberg + Caddy API key + fonts |
| `infra/print-corner-gotenberg/fly.toml` | Fly app config (1 GB, Mumbai) |
| `infra/print-corner-gotenberg/fonts/README.md` | Font install notes |
| `docs/PRINT_CORNER_ORACLE_GOTENBERG_SETUP.md` | VM alternative (Oracle/GCP) |
