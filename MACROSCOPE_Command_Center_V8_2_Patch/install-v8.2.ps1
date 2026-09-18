$ErrorActionPreference = 'Stop'

# Run this script from the MACROSCOPE project root, e.g.
#   C:\MACROSCOPE-Command-Center
$ProjectRoot = (Get-Location).Path
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$IndexTarget = Join-Path $ProjectRoot 'index.html'
$WorkerDir = Join-Path $ProjectRoot 'worker'
$WorkerIndexTarget = Join-Path $WorkerDir 'src\index.js'
$LiveDataTarget = Join-Path $WorkerDir 'src\live-data.js'
$Wrangler = Join-Path $WorkerDir 'wrangler.toml'

if (-not (Test-Path $IndexTarget)) { throw "index.html not found in $ProjectRoot. Run this script from the project root." }
if (-not (Test-Path $Wrangler)) { throw "worker\wrangler.toml not found. The working Worker configuration will NOT be recreated automatically." }

$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupDir = Join-Path $ProjectRoot "backup-v8.2-$Stamp"
New-Item -ItemType Directory -Path $BackupDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $BackupDir 'worker\src') -Force | Out-Null

Copy-Item $IndexTarget (Join-Path $BackupDir 'index.html')
if (Test-Path $WorkerIndexTarget) { Copy-Item $WorkerIndexTarget (Join-Path $BackupDir 'worker\src\index.js') }
if (Test-Path $LiveDataTarget) { Copy-Item $LiveDataTarget (Join-Path $BackupDir 'worker\src\live-data.js') }
Copy-Item $Wrangler (Join-Path $BackupDir 'wrangler.toml')

# Frontend + Worker source only. D1 database ID and secrets are not in the payload.
Copy-Item (Join-Path $ScriptRoot 'payload\index.html') $IndexTarget -Force
Copy-Item (Join-Path $ScriptRoot 'payload\worker\src\index.js') $WorkerIndexTarget -Force
Copy-Item (Join-Path $ScriptRoot 'payload\worker\src\live-data.js') $LiveDataTarget -Force

# Safely tune ONLY public origins and cron schedules. Preserve the D1 block, database UUID,
# model setting, and every other wrangler.toml line exactly as the user has configured it.
$text = Get-Content $Wrangler -Raw

$desiredOrigins = @(
  'https://econmetricshub.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
)

$originMatch = [regex]::Match($text, '(?m)^ALLOWED_ORIGIN\s*=\s*"([^"]*)"\s*$')
if ($originMatch.Success) {
  $existing = $originMatch.Groups[1].Value.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  $all = @($existing + $desiredOrigins | Select-Object -Unique)
  $replacement = 'ALLOWED_ORIGIN = "' + ($all -join ',') + '"'
  $text = [regex]::Replace($text, '(?m)^ALLOWED_ORIGIN\s*=\s*"[^"]*"\s*$', $replacement, 1)
} else {
  $text = $text -replace '(?m)^\[vars\]\s*$', "[vars]`r`nALLOWED_ORIGIN = `"$($desiredOrigins -join ',')`""
}

$desiredCrons = 'crons = ["*/30 11-23 * * 1-5", "30 1 * * *"]'
if ($text -match '(?m)^\[triggers\]\s*$') {
  if ($text -match '(?m)^crons\s*=.*$') {
    $text = [regex]::Replace($text, '(?m)^crons\s*=.*$', $desiredCrons, 1)
  } else {
    $text = $text -replace '(?m)^\[triggers\]\s*$', "[triggers]`r`n$desiredCrons"
  }
} else {
  $text += "`r`n`r`n# Automatic live-data checks. Cron expressions run in UTC.`r`n[triggers]`r`n$desiredCrons`r`n"
}

Set-Content -Path $Wrangler -Value $text -Encoding UTF8

Write-Host ''
Write-Host 'MACROSCOPE V8.2 patch installed.' -ForegroundColor Green
Write-Host "Backup: $BackupDir"
Write-Host ''
Write-Host 'Preserved: D1 database binding/UUID, secrets, and all unmodified wrangler.toml settings.' -ForegroundColor Cyan
Write-Host 'Next:'
Write-Host '  1. Preview from the PROJECT ROOT:  py -m http.server 8000'
Write-Host '  2. Deploy Worker source/config:      cd worker'
Write-Host '                                        npx.cmd wrangler deploy --config .\wrangler.toml'
