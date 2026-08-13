/**
 * Generates deploy/CMS-Multi-Church-Deploy-Guide.pdf
 * Run: node deploy/generate-deploy-guide-pdf.js
 */
import { jsPDF } from 'jspdf'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outPath = join(__dirname, 'CMS-Multi-Church-Deploy-Guide.pdf')

const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
const PW = 210
const M = 18
const maxW = PW - M * 2
let y = M

const NAVY = [13, 34, 68]
const TEAL = [15, 118, 110]
const GRAY = [71, 85, 105]
const LIGHT = [248, 250, 252]
const LINE = [226, 232, 240]

function ensureSpace(need = 12) {
  if (y + need > 285) {
    doc.addPage()
    y = M
    drawFooter()
  }
}

function drawFooter() {
  const page = doc.internal.getNumberOfPages()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text('Church CMS — Multi-Church Deploy Guide', M, 290)
  doc.text(`Page ${page}`, PW - M, 290, { align: 'right' })
}

function h1(text) {
  ensureSpace(18)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...NAVY)
  doc.text(text, M, y)
  y += 10
  doc.setDrawColor(...TEAL)
  doc.setLineWidth(0.8)
  doc.line(M, y, M + 40, y)
  y += 8
}

function h2(text) {
  ensureSpace(14)
  y += 2
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...TEAL)
  doc.text(text, M, y)
  y += 7
}

function h3(text) {
  ensureSpace(10)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...NAVY)
  doc.text(text, M, y)
  y += 6
}

function para(text) {
  ensureSpace(10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  const lines = doc.splitTextToSize(text, maxW)
  ensureSpace(lines.length * 5 + 2)
  doc.text(lines, M, y)
  y += lines.length * 5 + 3
}

function bullet(text, indent = 0) {
  ensureSpace(8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  const x = M + indent
  const lines = doc.splitTextToSize(text, maxW - indent - 4)
  doc.text('•', x, y)
  doc.text(lines, x + 5, y)
  y += lines.length * 5 + 1.5
}

function numbered(n, text) {
  ensureSpace(8)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TEAL)
  doc.text(`${n}.`, M, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY)
  const lines = doc.splitTextToSize(text, maxW - 8)
  doc.text(lines, M + 8, y)
  y += lines.length * 5 + 2
}

function codeBlock(lines) {
  const arr = Array.isArray(lines) ? lines : lines.split('\n')
  const boxH = arr.length * 4.6 + 8
  ensureSpace(boxH + 4)
  doc.setFillColor(...LIGHT)
  doc.setDrawColor(...LINE)
  doc.roundedRect(M, y - 3, maxW, boxH, 2, 2, 'FD')
  doc.setFont('courier', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(30, 41, 59)
  let cy = y + 3
  for (const line of arr) {
    doc.text(line, M + 4, cy)
    cy += 4.6
  }
  y += boxH + 4
}

function callout(title, text) {
  const body = doc.splitTextToSize(text, maxW - 10)
  const boxH = body.length * 5 + 14
  ensureSpace(boxH + 4)
  doc.setFillColor(255, 247, 237)
  doc.setDrawColor(251, 146, 60)
  doc.roundedRect(M, y - 3, maxW, boxH, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(154, 52, 18)
  doc.text(title, M + 4, y + 3)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 53, 15)
  doc.text(body, M + 4, y + 9)
  y += boxH + 4
}

function table(headers, rows) {
  const cols = headers.length
  const colW = maxW / cols
  const rowH = 8
  ensureSpace(rowH * (rows.length + 1) + 6)

  // header
  doc.setFillColor(...NAVY)
  doc.rect(M, y, maxW, rowH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  headers.forEach((h, i) => doc.text(h, M + 2 + i * colW, y + 5.5))
  y += rowH

  rows.forEach((row, ri) => {
    ensureSpace(rowH + 2)
    if (ri % 2 === 0) {
      doc.setFillColor(...LIGHT)
      doc.rect(M, y, maxW, rowH, 'F')
    }
    doc.setDrawColor(...LINE)
    doc.rect(M, y, maxW, rowH)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...GRAY)
    row.forEach((cell, i) => {
      const t = doc.splitTextToSize(String(cell), colW - 3)
      doc.text(t[0] || '', M + 2 + i * colW, y + 5.5)
    })
    y += rowH
  })
  y += 4
}

// ── Cover / intro ──────────────────────────────────────────────────────────
drawFooter()

doc.setFillColor(...NAVY)
doc.rect(0, 0, PW, 48, 'F')
doc.setFont('helvetica', 'bold')
doc.setFontSize(22)
doc.setTextColor(255, 255, 255)
doc.text('Multi-Church Deploy Guide', M, 22)
doc.setFont('helvetica', 'normal')
doc.setFontSize(11)
doc.setTextColor(186, 230, 253)
doc.text('Church CMS — Push updates to Zion Hub & all client churches', M, 32)
doc.setFontSize(9)
doc.setTextColor(148, 163, 184)
doc.text('Easy reference for Push-All deploy helper', M, 40)
y = 58

para('This guide explains how to publish website updates to every church from one place — without repeating long git push and Vercel steps each time.')

h2('1. The simple idea')
para('You develop the CMS once. Each church has its own website (Vercel) and database (Supabase). When you change the UI, you need to send the same code to every church’s GitHub repo, and sometimes force a Vercel production build.')

table(
  ['Church', 'Git remote', 'Live website'],
  [
    ['Zion Hub', 'origin', 'cms-three-mu.vercel.app'],
    ['St Pauls', 'stpauls', 'cms-trichystpaulschurch.vercel.app'],
  ],
)

callout(
  'Why not only one push?',
  'Today each church can use its own GitHub repo. Pushing to origin updates Zion Hub only. St Pauls needs a second push (remote: stpauls). On Hobby Vercel plans, Cursor co-authored commits can also block auto-deploy — so the helper runs a Vercel CLI production deploy for St Pauls.',
)

h2('2. What we built for you')
para('A small helper lives in the deploy folder:')
bullet('deploy\\Push-All.bat — double-click menu (easiest)')
bullet('deploy\\Push-All.ps1 — PowerShell engine')
bullet('deploy\\clients.json — list of churches (add more later)')

para('One run can:')
numbered(1, 'Commit your changes with a clean message (no Cursor co-author trailer)')
numbered(2, 'Push to every git remote in clients.json')
numbered(3, 'Run Vercel production deploy for churches that need it (St Pauls)')

h2('3. How to use (everyday)')

h3('Option A — Double-click (recommended)')
numbered(1, 'Open the project folder: Church-CMS-React')
numbered(2, 'Go into the deploy folder')
numbered(3, 'Double-click Push-All.bat')
numbered(4, 'Choose an option:')

codeBlock([
  '1) Push all remotes + Vercel prod',
  '2) Push all remotes only (skip Vercel CLI)',
  '3) Dry run (show what would happen)',
  '4) St Pauls only (push + Vercel)',
  '5) Exit',
])

para('If you have uncommitted files, the script asks for a commit message. Type a short message and press Enter. Leave blank to skip committing and only push what is already committed.')

h3('Option B — From terminal')
codeBlock([
  'cd C:\\Projects\\Church-CMS-React',
  'npm run deploy:all',
  'npm run deploy:stpauls',
  'npm run deploy:dry',
])

h3('Option C — PowerShell with flags')
codeBlock([
  'powershell -ExecutionPolicy Bypass -File .\\deploy\\Push-All.ps1',
  'powershell -ExecutionPolicy Bypass -File .\\deploy\\Push-All.ps1 -Message "Fix receipts print"',
  'powershell -ExecutionPolicy Bypass -File .\\deploy\\Push-All.ps1 -SkipVercel',
  'powershell -ExecutionPolicy Bypass -File .\\deploy\\Push-All.ps1 -Only stpauls',
  'powershell -ExecutionPolicy Bypass -File .\\deploy\\Push-All.ps1 -DryRun',
])

h2('4. What “success” looks like')
bullet('Each remote shows: OK  Pushed to …/main')
bullet('St Pauls Vercel shows: OK  Live: https://cms-trichystpaulschurch.vercel.app')
bullet('Open the live site → hard refresh (Ctrl+F5) → confirm your change')

callout(
  'First time Vercel CLI',
  'If asked to log in, use the church Vercel account that owns that project (for St Pauls: trichystpaulschurch). Stay logged in so future runs are quiet.',
)

h2('5. Adding a new church later')
numbered(1, 'Create the church GitHub repo and Vercel project (with that church’s Supabase env vars).')
numbered(2, 'Add a git remote on your PC:')
codeBlock([
  'git remote add stmarys git@github.com:ORG/StMarys-CMS.git',
])
numbered(3, 'Edit deploy\\clients.json and add a block like St Pauls:')
codeBlock([
  '{',
  '  "id": "stmarys",',
  '  "label": "St Marys",',
  '  "remote": "stmarys",',
  '  "siteUrl": "https://cms-stmarys.vercel.app",',
  '  "vercelDeploy": true,',
  '  "vercelProject": "cms-stmarys",',
  '  "vercelOrgId": "team_....",',
  '  "vercelProjectId": "prj_...."',
  '}',
])
numbered(4, 'Get Org ID / Project ID from the church’s .vercel/project.json after linking once, or from the Vercel dashboard.')
numbered(5, 'Run Push-All again — the new church is included automatically.')

para('Set vercelDeploy to false if GitHub → Vercel auto-deploy works reliably for that church (common on Pro, or when commit authors match the Vercel owner).')

h2('6. Troubleshooting')

h3('I pushed but the live site has no change')
bullet('Hard refresh the browser (Ctrl+F5) or try a private window.')
bullet('Open Vercel → Deployments. If status is BLOCKED, Hobby blocked the Git author/co-author.')
bullet('Fix: run menu option 1 or 4 so the script does npx vercel --prod.')

h3('Error: commit author does not have contributing access')
para('Hobby teams do not allow collaboration. Commits co-authored by Cursor (or authored by someone who is not the Vercel owner) get blocked.')
bullet('Push-All creates clean commits and CLI-deploys St Pauls — use it instead of manual git push only.')
bullet('Long-term options: upgrade that Vercel team to Pro, or always deploy via this script.')

h3('Remote missing')
codeBlock([
  'git remote -v',
  'git remote add stpauls git@github.com:trichystpaulschurch-del/StPauls-CMS.git',
])

h3('Wrong church / skipped Vercel')
bullet('Check deploy\\clients.json — vercelDeploy must be true for CLI deploy.')
bullet('Confirm you are logged into the correct Vercel account: npx vercel whoami')

h2('7. What this helper does NOT deploy')
para('Frontend (React UI) is covered. These still need a separate per-church step:')
bullet('Supabase SQL migrations / new tables')
bullet('Edge Functions (cms-full-backup, cms-provision, …)')
bullet('Supabase secrets (Google OAuth, payment keys, …)')
bullet('Google Drive backup folder setup')

para('See also: docs\\MULTI_CHURCH_DEPLOYMENT_GUIDE.md for the full multi-church architecture.')

h2('8. Quick cheat sheet')
table(
  ['Goal', 'Do this'],
  [
    ['Update all churches', 'Double-click Push-All.bat → option 1'],
    ['Preview only', 'Option 3 (Dry run)'],
    ['St Pauls only', 'Option 4'],
    ['Git push only', 'Option 2'],
    ['Add new church', 'git remote add + edit clients.json'],
  ],
)

y += 4
doc.setFont('helvetica', 'bold')
doc.setFontSize(10)
doc.setTextColor(...NAVY)
doc.text('Remember', M, y)
y += 6
para('After any successful deploy, always verify on the live church URL — not only on localhost.')

y += 6
doc.setDrawColor(...LINE)
doc.line(M, y, PW - M, y)
y += 8
doc.setFont('helvetica', 'normal')
doc.setFontSize(9)
doc.setTextColor(148, 163, 184)
doc.text('Generated for Church CMS · deploy/Push-All · Keep this PDF with the project for future reference.', M, y)

// Write file
const buf = Buffer.from(doc.output('arraybuffer'))
mkdirSync(__dirname, { recursive: true })
writeFileSync(outPath, buf)
console.log('Wrote', outPath)
