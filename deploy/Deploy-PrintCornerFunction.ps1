# Deploy cms-print-corner Edge Function to the linked Supabase project.
# Prerequisites: npx supabase login (once), migration run, CLOUDCONVERT_API_KEY secret set.

param(
  [string]$ProjectRef = 'pnkbiovspluyqcszgfyw',
  [switch]$SetSecret,
  [string]$CloudConvertKey = ''
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "Deploying cms-print-corner to project $ProjectRef ..." -ForegroundColor Cyan

if ($SetSecret) {
  if (-not $CloudConvertKey) {
    throw 'Pass -CloudConvertKey when using -SetSecret'
  }
  npx supabase secrets set "CLOUDCONVERT_API_KEY=$CloudConvertKey" --project-ref $ProjectRef
}

npx supabase functions deploy cms-print-corner --project-ref $ProjectRef

Write-Host ''
Write-Host 'Done. Verify: Dashboard -> Edge Functions -> cms-print-corner' -ForegroundColor Green
Write-Host 'Smoke test (logged into CMS, browser console):'
Write-Host "  supabase.functions.invoke('cms-print-corner', { body: { action: 'ping' } })"
