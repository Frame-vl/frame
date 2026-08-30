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

$harness = (Resolve-Path (Join-Path $PSScriptRoot 'guard-harness.html')).Path
$uri = [System.Uri]::new($harness).AbsoluteUri
$profile = Join-Path $env:TEMP ('frame-edge-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $profile | Out-Null

try {
  $output = & $edge --headless=new --disable-gpu --no-first-run --disable-default-apps --allow-file-access-from-files --user-data-dir=$profile --dump-dom $uri 2>$null
  $text = ($output -join "`n")
  if ($text -notmatch 'FRAME_GUARD_TEST_PASS') {
    Write-Host $text
    throw 'FRAME browser guard harness failed'
  }
  Write-Host 'FRAME browser guard harness PASS'
}
finally {
  Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue
}
