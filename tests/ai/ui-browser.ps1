$ErrorActionPreference = 'Stop'

$edgeCandidates = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
)
$edge = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) {
  $cmd = Get-Command msedge.exe -ErrorAction SilentlyContinue
  if ($cmd) { $edge = $cmd.Source }
}
if (-not $edge) { throw 'Microsoft Edge not found on FRAME-PC' }

$harness = (Resolve-Path (Join-Path $PSScriptRoot 'ui-harness.html')).Path
$uri = [System.Uri]::new($harness).AbsoluteUri
$profile = Join-Path $env:TEMP ('frame-edge-ui-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $profile | Out-Null

try {
  $args = @(
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--disable-default-apps',
    '--allow-file-access-from-files',
    "--user-data-dir=$profile",
    '--virtual-time-budget=7000',
    '--dump-dom',
    $uri
  )
  $output = & $edge $args 2>&1
  $text = ($output -join "`n")
  if ($text -notmatch 'FRAME_UI_E2E_PASS') {
    Write-Host '--- FRAME UI browser output ---'
    Write-Host $text
    Write-Host '--- end output ---'
    throw 'FRAME UI end-to-end browser harness failed'
  }
  Write-Host 'FRAME UI end-to-end browser harness PASS'
}
finally {
  Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue
}
