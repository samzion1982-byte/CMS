# Deploy cms-print-corner Edge Function to one or more Supabase projects.
# Prerequisites: npx supabase login (once), migration run on each project.
#
# Examples:
#   .\deploy\Deploy-PrintCornerFunction.ps1 -Target all
#   .\deploy\Deploy-PrintCornerFunction.ps1 -Target all -SetSecret -CloudConvertKey "sk-..."
#   .\deploy\Deploy-PrintCornerFunction.ps1 -Target stpauls

param(
  [ValidateSet('stpauls', 'hub', 'all')]
  [string]$Target = 'all',
  [string]$ProjectRef = '',
  [switch]$SetSecret,
  [string]$CloudConvertKey = ''
)

$ProjectRefs = [ordered]@{
  stpauls = 'wjasjrthijpxlarreics'   # trichystpaulschurch-cms (St Paul's live)
  hub     = 'pnkbiovspluyqcszgfyw'   # zion-cms-hub (dev / bootstrap)
}

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$targets = if ($ProjectRef) {
  @(@{ name = 'custom'; ref = $ProjectRef })
} elseif ($Target -eq 'all') {
  $ProjectRefs.GetEnumerator() | ForEach-Object { @{ name = $_.Key; ref = $_.Value } }
} else {
  @(@{ name = $Target; ref = $ProjectRefs[$Target] })
}

if ($SetSecret -and -not $CloudConvertKey) {
  throw 'Pass -CloudConvertKey when using -SetSecret'
}

Write-Host "Deploying cms-print-corner to $($targets.Count) project(s)..." -ForegroundColor Cyan

foreach ($t in $targets) {
  Write-Host ""
  Write-Host "=== $($t.name) ($($t.ref)) ===" -ForegroundColor Yellow

  if ($SetSecret) {
    npx supabase secrets set "CLOUDCONVERT_API_KEY=$CloudConvertKey" --project-ref $t.ref
  }

  npx supabase functions deploy cms-print-corner --project-ref $t.ref
}

Write-Host ""
Write-Host "Done. Verify each project: Dashboard -> Edge Functions -> cms-print-corner" -ForegroundColor Green
Write-Host "Smoke test (logged into CMS, browser console):"
Write-Host "  supabase.functions.invoke('cms-print-corner', { body: { action: 'ping' } })"
