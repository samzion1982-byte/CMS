# Print Corner — Google Cloud Free Tier + Gotenberg

Try a **shared Word→PDF converter** on Google Cloud **Always Free** (`e2-micro`), without Oracle or CloudConvert credits.

**Honest limits**

| Item | Reality |
|------|---------|
| Free VM | **1 × e2-micro** in selected **US** regions (check Free tier in Billing) |
| RAM | **~1 GB** — Gotenberg/LibreOffice may be **slow** or OOM on heavy letterheads |
| If it fails | Upgrade to **e2-small** (paid) or stay on CloudConvert |
| Disk | Small boot disk still may have a **tiny** charge outside free allowance — watch Billing |

This is a **trial**. If free-tier is too weak, we keep CloudConvert and revisit.

---

## 1. Before you click Create

1. Google Cloud Console → **Billing** → project has a billing account (required even for free tier).
2. **Billing → Budgets & alerts** → create alert at **$5** (safety net).
3. Confirm free tier: [cloud.google.com/free](https://cloud.google.com/free) → Compute Engine **e2-micro**.

**Free-tier regions (typical):** `us-west1`, `us-central1`, `us-east1`  
(India regions are usually **not** free-tier for e2-micro.)

---

## 2. Create the free VM (Console)

1. **☰ → Compute Engine → VM instances → Create instance**
2. Set:

| Field | Value |
|-------|--------|
| **Name** | `zion-gotenberg` |
| **Region** | `us-west1` (or other free-tier US region) |
| **Zone** | any (e.g. `us-west1-b`) |
| **Machine type** | **e2-micro** (series E2) — must say free tier eligible if shown |
| **Boot disk** | **Ubuntu 22.04 or 24.04 LTS**, size **30 GB** (keep small) |
| **Firewall** | Allow **HTTP** and **HTTPS** (check both) |
| **SSH** | Default OS Login / browser SSH is fine |

3. **Create**. Wait until green **Running**.
4. Copy **External IP**.

### Firewall (if HTTP/HTTPS not open)

**☰ → VPC network → Firewall → Create rule** (or use the VM’s “Allow HTTP/HTTPS”):

- `tcp:22` (SSH)  
- `tcp:80`, `tcp:443` (Caddy later)  
- Optional for first test only: `tcp:3000` from **your IP only** — remove later  

Do **not** leave Gotenberg port **3000** open to `0.0.0.0/0` permanently.

---

## 3. Install Docker + Gotenberg on the VM

**SSH:** VM row → **SSH** (browser), or:

```powershell
gcloud compute ssh zion-gotenberg --zone=us-west1-b
```

On the VM:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out/in (or new SSH), then:

```bash
sudo docker run -d --name gotenberg --restart unless-stopped -p 127.0.0.1:3000:3000 gotenberg/gotenberg:8
sudo docker ps
curl -s http://127.0.0.1:3000/health
```

Expect healthy JSON / OK.

**Memory tip on e2-micro:** if the container keeps dying, free tier may be too small — note the error and stop the VM to avoid surprise disk cost while we decide next step.

---

## 4. Quick convert test (from the VM)

```bash
# Put any small .docx on the VM, then:
curl -s -F "files=@./test.docx" http://127.0.0.1:3000/forms/libreoffice/convert -o test.pdf
ls -la test.pdf
```

If `test.pdf` is non-empty, conversion works.

---

## 5. Expose securely (before linking CMS)

**Do not** point Supabase at bare `http://EXTERNAL_IP:3000` on the open internet.

Options (pick one later):

1. **Caddy** + domain + shared API key header (like Oracle guide)  
2. **Cloudflare Tunnel** (no open 3000)  
3. Temporary test: firewall allow **only your home IP** → port 3000  

After HTTPS + key exist, set on each church Supabase:

| Secret | Example |
|--------|---------|
| `GOTENBERG_URL` | `https://convert.yourdomain.com` |
| `GOTENBERG_API_KEY` | long random string |

Then we change `cms-print-corner` to call Gotenberg instead of CloudConvert.

---

## 6. Stop charges if the trial fails

1. **Stop** or **Delete** the VM (`zion-gotenberg`).  
2. Delete the **disk** if prompted (orphaned disks still bill).  
3. Check **Billing → Reports** next day.

---

## 7. Checklist for you right now

- [ ] Budget alert $5  
- [ ] Create **e2-micro** in **us-west1** (or free-tier US region)  
- [ ] SSH → install Docker → run Gotenberg  
- [ ] `curl` health + one `test.docx` → `test.pdf`  
- [ ] Tell Samuel: **worked** / **OOM / killed** / **too slow**

We wire CMS only after step 4 succeeds.

---

## Related

- Oracle variant (more RAM free): `docs/PRINT_CORNER_ORACLE_GOTENBERG_SETUP.md`  
- Compose files: `infra/print-corner-gotenberg/`
