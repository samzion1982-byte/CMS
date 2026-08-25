# Print Corner — Oracle VM + Gotenberg + Supabase Edge

Complete setup guide for **one shared, free Oracle Cloud VM** that converts Word/HTML to PDF for **all church CMS projects**. Churches never touch the VM — only Zion configures it once.

**Use this for:** Print Corner letters (`.docx` mail merge), application forms, and HTML certificate previews.

**Who maintains it:** Zion / Super Admin (Samuel).  
**Per church:** Same `GOTENBERG_URL` + `GOTENBERG_API_KEY` in each Supabase project’s Edge Function secrets.

---

## 1. Big picture

```
┌─────────────────────────────────────────────────────────────────┐
│  ONE Oracle Always Free VM (shared by all churches)             │
│  Docker: Gotenberg (Word→PDF, HTML→PDF) + Caddy (HTTPS + key)   │
│  URL example: https://convert.zionsolutions.in                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
  Supabase: St Paul’s     Supabase: Demo parish    Supabase: Church B
  Edge: cms-print-corner  Edge: cms-print-corner   Edge: cms-print-corner
  secrets: same URL+key   secrets: same URL+key    secrets: same URL+key
        │                       │                       │
        ▼                       ▼                       ▼
  print-corner bucket     print-corner bucket       print-corner bucket
  (that church’s templates & issued PDFs only)
```

| Item | One VM for all? | Notes |
|------|-----------------|-------|
| Oracle VM + Gotenberg | **Yes** | Stateless converter |
| `GOTENBERG_URL` / API key | **Same values** on every Supabase | Copy-paste when onboarding a church |
| Word templates & issued PDFs | **No — per church** | Each Supabase storage bucket |

Gotenberg does **not** store church data. It receives a file, returns a PDF, and forgets.

---

## 2. What you need before starting

- Oracle Cloud account ([oracle.com/cloud/free](https://www.oracle.com/cloud/free)) — credit card may be required for verification; stay on **Always Free** shapes to avoid charges.
- SSH key on your PC (PowerShell or Git Bash):
  ```powershell
  ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\oracle_print_corner -N '""'
  ```
- A domain (optional but recommended) e.g. `convert.zionsolutions.in` → VM public IP.
- Repo folder to copy to the VM: `infra/print-corner-gotenberg/`

**Recommended region (India):** `ap-mumbai-1` or `ap-hyderabad-1`. If **Out of capacity**, try Singapore, Tokyo, or Amsterdam and retry off-peak.

---

## 3. Part A — Create the Oracle VM (step by step)

### Step A1 — Sign up

1. Open [https://www.oracle.com/cloud/free/](https://www.oracle.com/cloud/free/) → **Start for free**.
2. Complete registration (home region is **permanent** for Always Free — pick closest to you).
3. Sign in to **Oracle Cloud Console**.

### Step A2 — Create an Always Free ARM instance

1. **☰ Menu** → **Compute** → **Instances** → **Create instance**.
2. **Name:** `zion-gotenberg` (or any name).
3. **Placement:** keep default compartment.
4. **Image:** **Ubuntu 24.04** (or latest Ubuntu LTS, **aarch64**).
5. **Shape:** click **Change shape**  
   - **Ampere** → **VM.Standard.A1.Flex**  
   - Must show **Always Free-eligible**  
   - **OCPUs:** `2` (max free is 4 total across instances)  
   - **Memory:** `12 GB` (or 6 GB if you plan a second free instance later)
6. **Networking:** use default VCN. Ensure **Assign a public IPv4 address** is checked.
7. **Add SSH keys:** paste contents of `oracle_print_corner.pub` (or upload the file).
8. **Boot volume:** 50–100 GB is enough (200 GB is the free pool limit).
9. Click **Create**. Wait until state = **Running**. Note the **Public IP**.

### Step A3 — Open firewall ports (Oracle VCN)

1. On the instance page, click the **Subnet** link → **Security List** (default).
2. **Add Ingress Rules:**

| Source CIDR | Protocol | Dest port | Description |
|-------------|----------|-----------|-------------|
| `0.0.0.0/0` | TCP | 22 | SSH |
| `0.0.0.0/0` | TCP | 80 | HTTP (Caddy / Let’s Encrypt) |
| `0.0.0.0/0` | TCP | 443 | HTTPS |

**Do not** open port 3000 (Gotenberg) to the internet.

### Step A4 — SSH into the VM

From PowerShell:

```powershell
ssh -i $env:USERPROFILE\.ssh\oracle_print_corner ubuntu@YOUR_PUBLIC_IP
```

First login: accept fingerprint. You should see an `ubuntu@...` prompt.

### Step A5 — Install Docker

On the VM:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
```

Log out and SSH back in so `docker` works without `sudo`:

```bash
exit
# SSH again, then:
docker --version
docker compose version
```

### Step A6 — Optional: OS firewall (ufw)

```bash
sudo apt-get install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 4. Part B — Deploy Gotenberg + Caddy on the VM

### Step B1 — Copy files to the VM

From your **Windows PC** (adjust paths):

```powershell
scp -i $env:USERPROFILE\.ssh\oracle_print_corner -r C:\Projects\Church-CMS-React\infra\print-corner-gotenberg ubuntu@YOUR_PUBLIC_IP:~/
```

On the VM:

```bash
cd ~/print-corner-gotenberg
cp .env.example .env
nano .env
```

Set:

```env
GOTENBERG_API_KEY=paste-output-of-openssl-rand-hex-32
GOTENBERG_DOMAIN=convert.yourdomain.com
CADDY_ADMIN_EMAIL=your-email@example.com
```

Generate a key on the VM:

```bash
openssl rand -hex 32
```

**Save this key** — you will paste the same value into every Supabase project as `GOTENBERG_API_KEY`.

### Step B2 — Start services

```bash
cd ~/print-corner-gotenberg
docker compose up -d
docker compose ps
docker compose logs -f --tail=50
```

Gotenberg health (on the VM only):

```bash
curl -s http://127.0.0.1:3000/health
```

### Step B3 — DNS (recommended)

At your domain registrar, add an **A record**:

| Type | Name | Value |
|------|------|-------|
| A | `convert` | `YOUR_PUBLIC_IP` |

Wait 5–30 minutes. Caddy will obtain a Let’s Encrypt certificate automatically when `GOTENBERG_DOMAIN` matches.

### Step B4 — Test from your PC (through Caddy + API key)

Replace domain, key, and path to a small `.docx`:

```powershell
curl.exe -X POST "https://convert.yourdomain.com/forms/libreoffice/convert" `
  -H "X-Gotenberg-Key: YOUR_GOTENBERG_API_KEY" `
  -F "files=@C:\path\to\test.docx" `
  -o test-out.pdf
```

Open `test-out.pdf`. If it looks like Word printed to PDF, the VM is ready.

**Without a domain yet:** temporarily set `GOTENBERG_DOMAIN` to the public IP in `.env` and use HTTP on port 80 only for testing — switch to a real domain before production.

---

## 5. Part C — Supabase Edge Function secrets (each church)

Do this **once per Supabase project** (St Paul’s, demo, future churches). Values are **identical** everywhere.

1. Supabase Dashboard → project → **Project Settings** → **Edge Functions** → **Secrets** (or CLI below).
2. Add:

| Secret | Example | Same for all churches? |
|--------|---------|------------------------|
| `GOTENBERG_URL` | `https://convert.zionsolutions.in` | **Yes** |
| `GOTENBERG_API_KEY` | (from `.env` on VM) | **Yes** |

CLI example (run from repo, linked to that project):

```bash
supabase secrets set GOTENBERG_URL=https://convert.zionsolutions.in
supabase secrets set GOTENBERG_API_KEY=your-long-hex-key
```

When `cms-print-corner` is implemented, deploy on **each** church project:

```bash
supabase functions deploy cms-print-corner
```

The function reads secrets and calls Gotenberg — never expose the API key in the React app.

---

## 6. Part D — How Edge Function will call Gotenberg (reference)

This section is for when `cms-print-corner` is built. Flow:

1. Load church `.docx` from `print-corner/templates/...` (Supabase Storage).
2. Merge `{member_name}`, `{date}`, … with **docxtemplater** (in Edge).
3. `POST` merged bytes to Gotenberg:

   **Word → PDF**

   ```
   POST {GOTENBERG_URL}/forms/libreoffice/convert
   Header: X-Gotenberg-Key: {GOTENBERG_API_KEY}
   Body: multipart form, field name `files`, merged .docx
   ```

4. Optional: overlay presbyter/secretary/treasurer signature PNGs with **pdf-lib**.
5. Upload final PDF to `print-corner/issued/...` (kept forever, included in backup sync).
6. Return signed URL to the wizard for preview/download.

**HTML certificates (built-in layouts):**

```
POST {GOTENBERG_URL}/forms/chromium/convert/html
Header: X-Gotenberg-Key: ...
Body: index.html + assets as multipart
```

---

## 7. Part E — Onboarding a new church (checklist)

Copy this when a new parish goes live:

- [ ] Church has its own Supabase + Vercel (see `MULTI_CHURCH_DEPLOYMENT_GUIDE.md`)
- [ ] Run Print Corner SQL migrations on **that** Supabase
- [ ] Create `print-corner` storage bucket (migration or dashboard)
- [ ] Set `GOTENBERG_URL` + `GOTENBERG_API_KEY` (same as all other churches)
- [ ] Deploy `cms-print-corner` Edge Function to **that** project
- [ ] Upload church letterhead `.docx` templates in Print Corner Settings
- [ ] Upload signatures in Church Setup (PNG preferred)
- [ ] Smoke test: one letter preview + one issued PDF in storage

**You do not** create a new Oracle VM per church.

---

## 8. Part F — Maintenance

### Updates (Gotenberg / Caddy)

```bash
cd ~/print-corner-gotenberg
docker compose pull
docker compose up -d
```

### Logs

```bash
docker compose logs -f gotenberg
docker compose logs -f caddy
```

### Restart

```bash
docker compose restart
```

### Keep the free VM alive

- Oracle may reclaim **idle** Always Free resources in some cases. Light weekly traffic (health check) helps.
- Optional cron on the VM (health ping):

```bash
crontab -e
# Add:
*/30 * * * * curl -sf http://127.0.0.1:3000/health >/dev/null || cd /home/ubuntu/print-corner-gotenberg && docker compose up -d
```

### Rotate API key

1. Generate new key in `.env` on VM → `docker compose up -d`.
2. Update `GOTENBERG_API_KEY` on **every** Supabase project.
3. Redeploy or wait — Edge Functions pick up new secrets within minutes.

---

## 9. Part G — Troubleshooting

| Problem | What to check |
|---------|----------------|
| **Out of capacity** creating A1 | Try another region; retry at night UTC; use 1 OCPU / 6 GB first |
| **401 Unauthorized** from converter URL | `X-Gotenberg-Key` header missing or wrong; matches VM `.env` |
| **Connection timeout** from Supabase Edge | VM down; port 443 closed in Oracle Security List; wrong URL |
| **PDF layout wrong** | Fix the Word template; avoid text boxes; use simple paragraphs |
| **Tamil glyphs missing** | Install fonts in custom Docker image later if needed; test with church `.docx` |
| **Gotenberg OOM** | Reduce concurrent prints; bump VM memory; `--api-timeout=120s` already set |
| **Caddy no HTTPS** | DNS not pointing to VM; port 80 must be open for HTTP-01 challenge |

Test Gotenberg locally on VM (bypass Caddy):

```bash
curl -X POST http://127.0.0.1:3000/forms/libreoffice/convert \
  -F "files=@test.docx" -o local-test.pdf
```

---

## 10. Security rules (do not skip)

1. **Never** expose Gotenberg port 3000 on `0.0.0.0`.
2. **Always** require `X-Gotenberg-Key` via Caddy (or equivalent reverse proxy).
3. **Never** put `GOTENBERG_API_KEY` in React, GitHub, or church-facing UI.
4. Gotenberg official docs: treat it like a database — not public internet without a gate.
5. Restrict SSH (port 22) to your home IP in Oracle Security List if you have a static IP.

---

## 11. Cost summary

| Component | Cost |
|-----------|------|
| Oracle Always Free A1 VM | **₹0 / month** (within Always Free limits) |
| Gotenberg Docker image | **Free** (open source) |
| Domain (optional) | Your registrar (~₹500–800/year) |
| Supabase Edge invocations | Within existing Supabase plan |
| Per-church Oracle VM | **Not needed** |

---

## 12. Related repo paths

| Path | Purpose |
|------|---------|
| `infra/print-corner-gotenberg/docker-compose.yml` | VM deploy stack |
| `infra/print-corner-gotenberg/Caddyfile` | HTTPS + API key |
| `infra/print-corner-gotenberg/.env.example` | Environment template |
| `docs/MULTI_CHURCH_DEPLOYMENT_GUIDE.md` | Per-church Supabase/Vercel |
| `docs/GOOGLE_DRIVE_BACKUP_SETUP.md` | Issued PDFs backed up via `print-corner` bucket sync |

---

## 13. Quick reference card

```
VM stack:     docker compose up -d   (in ~/print-corner-gotenberg)
Health:       curl http://127.0.0.1:3000/health   (on VM)
Public test:  POST https://convert.DOMAIN/forms/libreoffice/convert
              Header: X-Gotenberg-Key: ***
Supabase:     GOTENBERG_URL + GOTENBERG_API_KEY (same all churches)
Churches:     ONE VM — do not duplicate per parish
```

When Print Corner CMS code lands, link this doc from Print Corner Settings → “Infrastructure help”.
