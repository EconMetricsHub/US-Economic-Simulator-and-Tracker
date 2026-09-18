$ErrorActionPreference = "Stop"

$projectRoot = (Get-Location).Path
$currentIndex = Join-Path $projectRoot "index.html"
$patchedIndex = Join-Path $PSScriptRoot "index-command-center.html"

if (!(Test-Path $currentIndex)) {
    throw "index.html was not found in $projectRoot. Run this installer from the MACROSCOPE project root, not from the worker folder."
}
if (!(Test-Path $patchedIndex)) {
    throw "The patched index file is missing: $patchedIndex"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $projectRoot "index.pre-command-center.$stamp.html"
Copy-Item $currentIndex $backup
Copy-Item $patchedIndex $currentIndex -Force

Write-Host ""
Write-Host "MACROSCOPE Command Center installed." -ForegroundColor Green
Write-Host "Backup: $backup"
Write-Host "Current: $currentIndex"
Write-Host ""
Write-Host "Your worker/, wrangler.toml, D1 UUID, and Cloudflare secrets were NOT changed." -ForegroundColor Cyan
Write-Host ""
Write-Host "Preview from the project root with:"
Write-Host "  python -m http.server 8000"
Write-Host "Then open: http://localhost:8000"
