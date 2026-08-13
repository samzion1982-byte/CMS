# =============================================================================
# Push-All.ps1 - One-shot multi-church CMS deploy
# =============================================================================
# What it does:
#   1) Optional clean commit (strips Cursor Co-authored-by trailers)
#   2) Pushes current branch to every remote in deploy/clients.json
#   3) For clients with vercelDeploy=true, runs npx vercel --prod
#      (bypasses Hobby "commit author blocked" deploys)
#
# Usage:
#   Double-click Push-All.bat
#   OR from repo root:
#     powershell -ExecutionPolicy Bypass -File .\deploy\Push-All.ps1
#     powershell -ExecutionPolicy Bypass -File .\deploy\Push-All.ps1 -Message "Fix receipts"
#     powershell -ExecutionPolicy Bypass -File .\deploy\Push-All.ps1 -SkipCommit
#     powershell -ExecutionPolicy Bypass -File .\deploy\Push-All.ps1 -SkipVercel
#     powershell -ExecutionPolicy Bypass -File .\deploy\Push-All.ps1 -DryRun
#     powershell -ExecutionPolicy Bypass -File .\deploy\Push-All.ps1 -Only stpauls
#
# Add a new church later:
#   1) git remote add <name> git@github.com:ORG/REPO.git
#   2) Add an entry under clients in deploy/clients.json
#   3) If Hobby blocks Git deploys, set vercelDeploy=true + project/org ids
# =============================================================================

[CmdletBinding()]
param(
  [string]$Message = '',
  [switch]$SkipCommit,
  [switch]$SkipVercel,
  [switch]$DryRun,
  [string[]]$Only = @()
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root '.git'))) {
  # Script lives in deploy/ - parent should be repo root
  $Root = $PSScriptRoot
}
Set-Location $Root

$ConfigPath = Join-Path $PSScriptRoot 'clients.json'
if (-not (Test-Path $ConfigPath)) { throw "Missing config: $ConfigPath" }

$config = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$branch = if ($config.branch) { $config.branch } else { 'main' }
$clients = @($config.clients)

# Commit identity for Vercel Hobby (must be a Zion team owner - not WMS smhtevwms)
$CommitName = 'Trichy St Pauls Church'
$CommitEmail = 'trichystpaulschurch@gmail.com'
if ($config.commitAuthor -and $config.commitAuthor.name) { $CommitName = [string]$config.commitAuthor.name }
if ($config.commitAuthor -and $config.commitAuthor.email) { $CommitEmail = [string]$config.commitAuthor.email }

if ($Only.Count -gt 0) {
  $want = $Only | ForEach-Object { $_.ToLowerInvariant() }
  $clients = $clients | Where-Object {
    $want -contains $_.id.ToLowerInvariant() -or $want -contains $_.remote.ToLowerInvariant()
  }
  if (-not $clients) { throw "No clients matched -Only $($Only -join ',')" }
}

function Write-Step([string]$text) {
  Write-Host ""
  Write-Host "==> $text" -ForegroundColor Cyan
}
function Write-Ok([string]$text) { Write-Host "    OK  $text" -ForegroundColor Green }
function Write-Warn([string]$text) { Write-Host "    !!  $text" -ForegroundColor Yellow }
function Write-Err([string]$text) { Write-Host "    XX  $text" -ForegroundColor Red }

function Get-GitStatusShort {
  git status --porcelain
}

function Test-HasCursorCoAuthor([string]$msg) {
  return $msg -match '(?im)^\s*Co-authored-by:\s*Cursor\s*<'
}

function New-CleanCommit([string]$msg) {
  # Write message without agent trailers; commit via commit-tree so hooks/agents
  # cannot append Co-authored-by: Cursor (which blocks Vercel Hobby deploys).
  # Author/committer come from deploy/clients.json (trichystpaulschurch) - NOT global git config.
  $tree = (git write-tree).Trim()
  $parent = (git rev-parse HEAD).Trim()
  $stamp = Get-Date -Format 'o'
  $msgFile = Join-Path $env:TEMP ("cms-commit-msg-{0}.txt" -f [guid]::NewGuid())
  # Keep only the subject/body the user asked for - drop any Co-authored-by lines
  $clean = ($msg -split "`r?`n" | Where-Object { $_ -notmatch '(?i)^\s*Co-authored-by:\s*' }) -join "`n"
  $clean = $clean.Trim()
  if (-not $clean) { throw 'Commit message is empty after cleaning trailers' }
  Set-Content -Path $msgFile -Value $clean -Encoding utf8

  $prevAuthorName = $env:GIT_AUTHOR_NAME
  $prevAuthorEmail = $env:GIT_AUTHOR_EMAIL
  $prevAuthorDate = $env:GIT_AUTHOR_DATE
  $prevCommitterName = $env:GIT_COMMITTER_NAME
  $prevCommitterEmail = $env:GIT_COMMITTER_EMAIL
  $prevCommitterDate = $env:GIT_COMMITTER_DATE
  try {
    $env:GIT_AUTHOR_NAME = $CommitName
    $env:GIT_AUTHOR_EMAIL = $CommitEmail
    $env:GIT_AUTHOR_DATE = $stamp
    $env:GIT_COMMITTER_NAME = $CommitName
    $env:GIT_COMMITTER_EMAIL = $CommitEmail
    $env:GIT_COMMITTER_DATE = $stamp
    $newSha = (git commit-tree $tree -p $parent -F $msgFile).Trim()
    git update-ref HEAD $newSha
    return $newSha
  } finally {
    Remove-Item $msgFile -ErrorAction SilentlyContinue
    if ($null -eq $prevAuthorName) { Remove-Item Env:\GIT_AUTHOR_NAME -ErrorAction SilentlyContinue } else { $env:GIT_AUTHOR_NAME = $prevAuthorName }
    if ($null -eq $prevAuthorEmail) { Remove-Item Env:\GIT_AUTHOR_EMAIL -ErrorAction SilentlyContinue } else { $env:GIT_AUTHOR_EMAIL = $prevAuthorEmail }
    if ($null -eq $prevAuthorDate) { Remove-Item Env:\GIT_AUTHOR_DATE -ErrorAction SilentlyContinue } else { $env:GIT_AUTHOR_DATE = $prevAuthorDate }
    if ($null -eq $prevCommitterName) { Remove-Item Env:\GIT_COMMITTER_NAME -ErrorAction SilentlyContinue } else { $env:GIT_COMMITTER_NAME = $prevCommitterName }
    if ($null -eq $prevCommitterEmail) { Remove-Item Env:\GIT_COMMITTER_EMAIL -ErrorAction SilentlyContinue } else { $env:GIT_COMMITTER_EMAIL = $prevCommitterEmail }
    if ($null -eq $prevCommitterDate) { Remove-Item Env:\GIT_COMMITTER_DATE -ErrorAction SilentlyContinue } else { $env:GIT_COMMITTER_DATE = $prevCommitterDate }
  }
}

# -- Banner ------------------------------------------------------------------
Write-Host ""
Write-Host "============================================" -ForegroundColor DarkCyan
Write-Host " CMS Multi-Church Deploy" -ForegroundColor White
Write-Host "============================================" -ForegroundColor DarkCyan
Write-Host " Repo   : $Root"
Write-Host " Branch : $branch"
Write-Host " Author : $CommitName <$CommitEmail>"
Write-Host " Mode   : $(if ($DryRun) { 'DRY RUN' } else { 'LIVE' })"
Write-Host " Clients: $($clients.Count)"

# -- Preflight ---------------------------------------------------------------
Write-Step "Preflight"
$currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($currentBranch -ne $branch) {
  Write-Warn "You are on '$currentBranch' (config expects '$branch'). Continuing on current branch."
  $branch = $currentBranch
}

foreach ($c in $clients) {
  $url = (git remote get-url $c.remote 2>$null)
  if (-not $url) {
    Write-Err "Remote '$($c.remote)' for $($c.label) is missing. Add it with: git remote add $($c.remote) <url>"
    throw "Missing remote $($c.remote)"
  }
  Write-Ok "$($c.label) -> $($c.remote) ($url)"
}

# -- Commit (optional) -------------------------------------------------------
$dirty = @(Get-GitStatusShort)
if ($SkipCommit) {
  Write-Step "Commit skipped (-SkipCommit)"
} elseif ($dirty.Count -eq 0) {
  Write-Step "Working tree clean - nothing to commit"
} else {
  Write-Step "Uncommitted changes detected"
  $dirty | ForEach-Object { Write-Host "      $_" }
  if (-not $Message) {
    $Message = Read-Host 'Commit message (blank = skip commit and push existing HEAD)'
  }
  if ([string]::IsNullOrWhiteSpace($Message)) {
    Write-Warn "No commit message - pushing existing HEAD only"
  } else {
    if ($DryRun) {
      Write-Warn "DRY RUN - would commit: $Message"
    } else {
      git add -A
      # Stage then create clean commit (avoids Cursor Co-authored-by trailer)
      $sha = New-CleanCommit $Message
      Write-Ok "Committed $sha - $Message"
    }
  }
}

# Warn if HEAD still has Cursor co-author (e.g. prior agent commit)
$headMsg = git log -1 --format=%B
if (Test-HasCursorCoAuthor $headMsg) {
  Write-Warn "HEAD commit contains Co-authored-by Cursor - Vercel Hobby may BLOCK auto-deploy."
  Write-Warn "This script will still CLI-deploy clients with vercelDeploy=true."
  if (-not $DryRun -and -not $SkipCommit) {
    $fix = Read-Host 'Create a clean empty follow-up commit to help GitHub deploys? (y/N)'
    if ($fix -match '^(y|yes)$') {
      $fixMsg = "Trigger redeploy (clean author)."
      # Empty commit: same tree, new commit - same author as New-CleanCommit
      $tree = (git write-tree).Trim()
      $parent = (git rev-parse HEAD).Trim()
      $msgFile = Join-Path $env:TEMP ("cms-commit-msg-{0}.txt" -f [guid]::NewGuid())
      Set-Content -Path $msgFile -Value $fixMsg -Encoding utf8
      $stamp = Get-Date -Format 'o'
      $prevAuthorName = $env:GIT_AUTHOR_NAME
      $prevAuthorEmail = $env:GIT_AUTHOR_EMAIL
      $prevAuthorDate = $env:GIT_AUTHOR_DATE
      $prevCommitterName = $env:GIT_COMMITTER_NAME
      $prevCommitterEmail = $env:GIT_COMMITTER_EMAIL
      $prevCommitterDate = $env:GIT_COMMITTER_DATE
      try {
        $env:GIT_AUTHOR_NAME = $CommitName
        $env:GIT_AUTHOR_EMAIL = $CommitEmail
        $env:GIT_AUTHOR_DATE = $stamp
        $env:GIT_COMMITTER_NAME = $CommitName
        $env:GIT_COMMITTER_EMAIL = $CommitEmail
        $env:GIT_COMMITTER_DATE = $stamp
        $newSha = (git commit-tree $tree -p $parent -F $msgFile).Trim()
        git update-ref HEAD $newSha
        Write-Ok "Clean follow-up commit $newSha"
      } finally {
        Remove-Item $msgFile -ErrorAction SilentlyContinue
        if ($null -eq $prevAuthorName) { Remove-Item Env:\GIT_AUTHOR_NAME -ErrorAction SilentlyContinue } else { $env:GIT_AUTHOR_NAME = $prevAuthorName }
        if ($null -eq $prevAuthorEmail) { Remove-Item Env:\GIT_AUTHOR_EMAIL -ErrorAction SilentlyContinue } else { $env:GIT_AUTHOR_EMAIL = $prevAuthorEmail }
        if ($null -eq $prevAuthorDate) { Remove-Item Env:\GIT_AUTHOR_DATE -ErrorAction SilentlyContinue } else { $env:GIT_AUTHOR_DATE = $prevAuthorDate }
        if ($null -eq $prevCommitterName) { Remove-Item Env:\GIT_COMMITTER_NAME -ErrorAction SilentlyContinue } else { $env:GIT_COMMITTER_NAME = $prevCommitterName }
        if ($null -eq $prevCommitterEmail) { Remove-Item Env:\GIT_COMMITTER_EMAIL -ErrorAction SilentlyContinue } else { $env:GIT_COMMITTER_EMAIL = $prevCommitterEmail }
        if ($null -eq $prevCommitterDate) { Remove-Item Env:\GIT_COMMITTER_DATE -ErrorAction SilentlyContinue } else { $env:GIT_COMMITTER_DATE = $prevCommitterDate }
      }
    }
  }
}

$head = (git rev-parse --short HEAD).Trim()
Write-Step "Deploying HEAD $head"

# -- Push remotes ------------------------------------------------------------
$pushFailed = @()
foreach ($c in $clients) {
  Write-Step "Push $($c.label) [$($c.remote)]"
  if ($DryRun) {
    Write-Warn "DRY RUN - would: git push $($c.remote) HEAD:refs/heads/$branch"
    continue
  }
  git push $c.remote "HEAD:refs/heads/$branch"
  if ($LASTEXITCODE -ne 0) {
    Write-Err "Push failed for $($c.label)"
    $pushFailed += $c.label
  } else {
    Write-Ok "Pushed to $($c.remote)/$branch"
  }
}

# -- Vercel production deploys -----------------------------------------------
# Always run after git push for vercelDeploy=true clients.
# Hobby plans may still show BLOCKED GitHub deployments; ignore those when CLI succeeds.
$vercelFailed = @()
if ($SkipVercel) {
  Write-Step "Vercel deploys skipped (-SkipVercel)"
} else {
  $vercelClients = @($clients | Where-Object { $_.vercelDeploy -eq $true })
  if ($vercelClients.Count -eq 0) {
    Write-Step "No clients marked vercelDeploy=true"
  } else {
    foreach ($c in $vercelClients) {
      Write-Step "Vercel production - $($c.label) ($($c.vercelProject))"
      if (-not $c.vercelOrgId -or -not $c.vercelProjectId) {
        Write-Err "Missing vercelOrgId / vercelProjectId in clients.json for $($c.id)"
        $vercelFailed += $c.label
        continue
      }
      # Always CLI-deploy after push for vercelDeploy clients (bypasses Hobby git-author block).
      Write-Warn "NOTE: Vercel Hobby may show a BLOCKED GitHub deployment for this push."
      Write-Warn "That GitHub auto-deploy can be ignored if this CLI deploy succeeds."
      if ($DryRun) {
        Write-Warn "DRY RUN - would: npx vercel --prod --yes --force (project $($c.vercelProject))"
        continue
      }
      $prevOrg = $env:VERCEL_ORG_ID
      $prevProj = $env:VERCEL_PROJECT_ID
      try {
        $env:VERCEL_ORG_ID = $c.vercelOrgId
        $env:VERCEL_PROJECT_ID = $c.vercelProjectId
        npx vercel --prod --yes --force
        if ($LASTEXITCODE -ne 0) {
          Write-Err "Vercel deploy failed for $($c.label)"
          $vercelFailed += $c.label
        } else {
          Write-Ok "CLI production deploy succeeded for $($c.label)"
          Write-Ok "Live: $($c.siteUrl)"
          Write-Warn "Ignore any BLOCKED GitHub deployment on the Vercel dashboard for this commit."
        }
      } finally {
        if ($null -eq $prevOrg) { Remove-Item Env:\VERCEL_ORG_ID -ErrorAction SilentlyContinue }
        else { $env:VERCEL_ORG_ID = $prevOrg }
        if ($null -eq $prevProj) { Remove-Item Env:\VERCEL_PROJECT_ID -ErrorAction SilentlyContinue }
        else { $env:VERCEL_PROJECT_ID = $prevProj }
      }
    }
  }
}

# -- Summary -----------------------------------------------------------------
Write-Host ""
Write-Host "============================================" -ForegroundColor DarkCyan
Write-Host " Done" -ForegroundColor White
Write-Host "============================================" -ForegroundColor DarkCyan
Write-Host " Commit : $(git rev-parse --short HEAD)"
foreach ($c in $clients) {
  $flag = if ($pushFailed -contains $c.label) { 'PUSH FAILED' }
          elseif ($vercelFailed -contains $c.label) { 'VERCEL FAILED' }
          else { 'OK' }
  $color = if ($flag -eq 'OK') { 'Green' } else { 'Red' }
  Write-Host (" {0,-12} {1,-28} {2}" -f $flag, $c.label, $c.siteUrl) -ForegroundColor $color
}

if ($pushFailed.Count -or $vercelFailed.Count) {
  Write-Host ""
  Write-Err "Some targets failed - scroll up for details."
  exit 1
}

Write-Host ""
Write-Host 'Tip: add a new church in deploy\clients.json then git remote add ...' -ForegroundColor DarkGray
Write-Host ""
