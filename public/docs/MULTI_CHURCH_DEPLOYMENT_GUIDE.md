# Multi-Church CMS Deployment Guide

Complete guide for deploying **one CMS codebase** to **many churches**, each with its **own Supabase**, and for pushing updates so live churches pick them up quickly.

---

## 1. Big picture (read this first)

Think of the system as **two layers**:

```
┌─────────────────────────────────────────────────────────────┐
│  SHARED (one GitHub repo = one product)                     │
│  • React / Vite website code                                │
│  • Edge Function source files in the repo                   │
│  • SQL migration files in the repo                          │
│  • Setup docs, backup logic, UI pages                       │
└───────────────────────────┬─────────────────────────────────┘
                            │  you deploy / copy from here
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PER CHURCH (private to that church)                        │
│  • Its own Supabase project (database + storage + auth)     │
│  • Its own Edge Functions + secrets                         │
│  • Its own Google Drive backup folder / OAuth               │
│  • Its own website URL (optional custom domain)             │
│  • Its own members, receipts, photos, users                 │
└─────────────────────────────────────────────────────────────┘
```

**Important truth**

| When you update… | Does every church get it automatically? |
|------------------|----------------------------------------|
| Website UI / pages (push to GitHub `main`) | **Yes** — if each church’s Vercel (or host) is connected to the same repo |
| SQL schema / new tables / RPCs | **No** — run migrations on **each** church Supabase |
| Edge Functions (`cms-full-backup`, etc.) | **No** — redeploy on **each** church Supabase |
| Edge secrets / OAuth / Drive folder | **No** — per church |

So: **frontend updates can be instant for all churches**; **backend (Supabase) updates are a checklist per church**.

---

## 2. Recommended architecture (example)

Example churches:

| Church | Website | Supabase |
|--------|---------|----------|
| St Paul’s | `https://stpauls.yourcms.app` | `https://aaa111.supabase.co` |
| St Mary’s | `https://stmarys.yourcms.app` | `https://bbb222.supabase.co` |
| St John’s | `https://stjohns.yourcms.app` | `https://ccc333.supabase.co` |

```
                    GitHub: samzion1982-byte/CMS
                              (branch: main)
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       ▼
   Vercel: St Paul’s        Vercel: St Mary’s       Vercel: St John’s
   env: URL+anon A          env: URL+anon B         env: URL+anon C
           │                       │                       │
           ▼                       ▼                       ▼
   Supabase A               Supabase B               Supabase C
   (data A, photos A)       (data B, photos B)       (data C, photos C)
           │                       │                       │
           ▼                       ▼                       ▼
   Google Drive A           Google Drive B           Google Drive C
```

**Why one Vercel project per church?**  
Vite bakes config at **build** time. Each church build must know **that** church’s Supabase URL + anon key. Separate Vercel projects (same GitHub repo, different env) is the simplest reliable model.

> Today the repo still has Supabase URL/keys hardcoded in `src/lib/supabase.js` for the first church. For true multi-church auto-deploy, move those to environment variables (see Section 7). Until then, changing church means changing that file or maintaining a branch/env strategy.

---

## 3. What lives where (concrete examples)

### Shared in GitHub (same for everyone)

```
CMS/
├── src/pages/...                 ← UI
├── src/lib/cmsFullBackup.js      ← backup client
├── supabase/functions/
│   ├── cms-full-backup/          ← backup/restore function SOURCE
│   ├── cms-google-oauth/         ← Google login SOURCE
│   └── cms-provision/            ← new-church bootstrap SOURCE
├── supabase/migrations/          ← SQL scripts
└── public/docs/                  ← setup / deployment guides
```

### Unique per church (never shared)

```
Church “St Mary’s”
├── Supabase project
│   ├── tables: members, receipts, ...   ← THEIR data
│   ├── storage: member-photos, ...      ← THEIR files
│   ├── auth users                       ← THEIR logins
│   ├── Edge Functions (deployed copy)
│   └── Secrets: GOOGLE_OAUTH_*, ...
├── Website env
│   ├── VITE_SUPABASE_URL=https://bbb222.supabase.co
│   └── VITE_SUPABASE_ANON_KEY=eyJ... (anon only)
└── Google Drive folder “CMS Backups – St Marys”
```

**Never put `SERVICE_ROLE` key in the public website.**  
Service role belongs only in Supabase Edge Function secrets / server tools (and temporarily in Backup → New Setup form, which does not store it).

---

## 4. Day-0: Prepare the product (once)

1. Finish development on GitHub `main`.
2. Connect **Vercel** (or similar) to the GitHub repo.
3. Decide naming pattern, e.g.:
   - Vercel project: `cms-stpauls`, `cms-stmarys`
   - Domain: `stpauls.yourcms.app`
4. Keep Edge Function sources and SQL migrations in the repo so you can copy them to every church.

---

## 5. Day-1: Onboard a NEW church (full checklist)

Worked example: **St Mary’s**.

### Step A — Create Supabase project

1. [supabase.com](https://supabase.com) → New project → name `cms-stmarys`.
2. Save:
   - Project URL → `https://bbbbbbbb.supabase.co`
   - `anon` `public` key
   - `service_role` key (keep private)
   - Database password

### Step B — Bootstrap schema / Super Admin

From an already-working CMS (e.g. St Paul’s) as Super Admin:

1. Open **Backup & Restore** → **New Setup / Upgrade** → **Initialize**.
2. Paste St Mary’s URL, anon, service_role, DB password, Super Admin email/password.
3. Run **Initialize church project**.

This creates bootstrap tables/buckets/admin on the **target** project.

Then in St Mary’s Supabase **SQL Editor**, run the full set of migrations from `supabase/migrations/` (same scripts you use for St Paul’s), especially backup-related ones if you want Drive backup.

### Step C — Deploy Edge Functions on St Mary’s Supabase

Deploy (paste from repo / CLI):

| Function | Purpose |
|----------|---------|
| `cms-google-oauth` | Connect Google Drive |
| `cms-full-backup` | Backup / restore / sync |
| `cms-provision` | Optional (only needed on a “hub” church that provisions others) |

Set secrets on St Mary’s project:

```text
GOOGLE_OAUTH_CLIENT_ID     = 123456789012-xxxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET = GOCSPX-xxxxxxxx
```

(See **Setup Documentation** on Backup page for OAuth Google Cloud steps.)

### Step D — Create website deployment for St Mary’s

1. Vercel → **Add New Project** → import **same** GitHub repo.
2. Project name: `cms-stmarys`.
3. Environment variables:

```text
VITE_SUPABASE_URL=https://bbbbbbbb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

4. Deploy → get URL e.g. `https://cms-stmarys.vercel.app`.
5. Optional: attach custom domain `stmarys.yourcms.app`.

### Step E — Google Drive backup for St Mary’s

1. Add redirect URI in Google Cloud:

```text
https://cms-stmarys.vercel.app/backup/google-callback
```

(or their custom domain equivalent)

2. On St Mary’s site → Backup → **Connect Google** → save Drive folder ID.

### Step F — Smoke test

- Login as Super Admin  
- Create a test member / receipt  
- Run a small Full Backup  
- Confirm Drive folder updates  

**St Mary’s is live.** Repeat A–F for each new church.

---

## 6. Day-N: You update the product — what to do

You fix a bug or add a feature. Goal: churches see it soon.

### Case 1 — Only website / UI change

Example: change button color, fix Receipts layout, improve Backup chooser.

```
 You edit code → git push origin main
        │
        ├──────────────► Vercel St Paul’s  rebuilds → live
        ├──────────────► Vercel St Mary’s  rebuilds → live
        └──────────────► Vercel St John’s  rebuilds → live
```

**Supabase:** nothing to do.  
**Users:** hard-refresh browser if they still see old UI.

### Case 2 — New / changed SQL (tables, RPCs, columns)

Example: new migration `20260901_fee_plans.sql`.

```
 Push to GitHub (keeps the .sql in repo)
        │
        ▼
 For EACH church Supabase SQL Editor:
   paste & run the new migration
```

Checklist example:

- [ ] St Paul’s — migration applied  
- [ ] St Mary’s — migration applied  
- [ ] St John’s — migration applied  

Until you run SQL on a church, that church’s **data layer** stays on the old schema (UI may error if it expects new columns).

### Case 3 — Edge Function change

Example: new backup sync version in `cms-full-backup`.

```
 Update file in GitHub
        │
        ▼
 For EACH church:
   Supabase → Edge Functions → cms-full-backup
   paste latest index.ts → Deploy
   (repeat for cms-google-oauth if changed)
```

Frontend deploy alone does **not** update Edge Functions.

### Case 4 — Mixed release (common)

Feature needs UI + SQL + function:

| Order | Action |
|------:|--------|
| 1 | Merge/push UI to `main` (all sites rebuild) |
| 2 | Run new SQL on every church |
| 3 | Redeploy updated Edge Functions on every church |
| 4 | Spot-check one Super Admin login per church |

---

## 7. Wire each site to its own Supabase (recommended)

### Target pattern in code

```js
// src/lib/supabase.js (recommended)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { ... })
```

### Vercel example (St Mary’s)

```
Settings → Environment Variables

VITE_SUPABASE_URL      = https://bbbbbbbb.supabase.co
VITE_SUPABASE_ANON_KEY = eyJ...anon...
```

Redeploy after changing env vars.

### Local `.env` example (your laptop)

```bash
VITE_SUPABASE_URL=https://bbbbbbbb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...anon...
```

Never commit real keys. Prefer `.env.local` (gitignored).

---

## 8. Domains & OAuth redirect map (example)

| Church | Site URL | Google OAuth redirect URI |
|--------|----------|---------------------------|
| St Paul’s | `https://stpauls.yourcms.app` | `https://stpauls.yourcms.app/backup/google-callback` |
| St Mary’s | `https://stmarys.yourcms.app` | `https://stmarys.yourcms.app/backup/google-callback` |

Add **every** redirect URI to the same Google OAuth Web client (or one client per church).

---

## 9. Backups in multi-church world

Each church backs up **its own** Supabase → **its own** Google Drive.

```
St Paul’s CMS ──OAuth──► Drive folder “Backups St Pauls”
                          ├── cms-full-backup-.../
                          └── cms-storage-sync/...

St Mary’s CMS ──OAuth──► Drive folder “Backups St Marys”
                          ├── cms-full-backup-.../
                          └── cms-storage-sync/...
```

Restore on St Mary’s never touches St Paul’s data (different projects).

Full Google setup: Backup page → **Setup Documentation**.

---

## 10. “New Setup / Upgrade” vs full deploy

| Tool | Use when |
|------|----------|
| **Initialize** (Backup page) | Brand-new empty Supabase — bootstrap tables/buckets/admin |
| **Upgrade** | Push bootstrap updates to an existing target project |
| **SQL migrations** | Apply full schema / later changes on that project |
| **Vercel deploy** | Ship UI to that church’s URL |
| **Edge Function deploy** | Ship backup/oauth/provision server code |

Initialize alone is **not** a full production church. Always follow with migrations + functions + website env + Drive.

---

## 11. Operating rhythm (simple calendar)

### Every code push (UI)

- Push `main` → all Vercel church projects auto-deploy  
- Smoke-test one page on 1–2 churches  

### Every backend change

Print this mini-sheet per release:

```
Release: 2026-09-01 Fee plans
UI:     [x] pushed to main
SQL:    [ ] St Paul’s  [ ] St Mary’s  [ ] St John’s
Funcs:  [ ] St Paul’s  [ ] St Mary’s  [ ] St John’s
Drive:  n/a
```

### Monthly

- Confirm automatic backups succeeded per church  
- Confirm Super Admin can still Connect Google  

---

## 12. FAQ

**Q: If I update GitHub, do Edge Functions update by themselves?**  
A: No. Redeploy each church’s functions.

**Q: Can one website URL serve all churches?**  
A: Not with the current simple Vite + one-client design. You’d need a multi-tenant login router. Prefer **one site deployment per church**.

**Q: Can churches share one Supabase?**  
A: Not recommended. Data, photos, users, and backups would mix. One Supabase per church is the model this CMS uses.

**Q: Does backup include Edge Functions?**  
A: No. Backup = database tables + storage files. Functions stay in repo/deploy.

**Q: What is the fastest path for a brand-new church?**  
A: New Supabase → Initialize → run migrations → deploy 2–3 Edge Functions + secrets → new Vercel project with that church’s env → Connect Google → test backup.

---

## 13. Master checklist (copy per church)

Church name: _______________  
Site URL: _______________  
Supabase URL: _______________  

- [ ] Supabase project created  
- [ ] Initialize (New Setup) run  
- [ ] SQL migrations applied  
- [ ] `cms-google-oauth` deployed  
- [ ] `cms-full-backup` deployed  
- [ ] OAuth secrets set  
- [ ] Vercel project linked to same GitHub repo  
- [ ] `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set  
- [ ] Custom domain (optional)  
- [ ] Google redirect URI added  
- [ ] Connect Google + Drive folder ID saved  
- [ ] Test login + test backup  

---

*Companion doc: Google Drive Backup Setup Guide (`Google_Drive_Backup_Setup_Guide.docx`).*
