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
$stdout = Join-Path $env:TEMP ('frame-edge-out-' + [guid]::NewGuid().ToString('N') + '.txt')
$stderr = Join-Path $env:TEMP ('frame-edge-err-' + [guid]::NewGuid().ToString('N') + '.txt')
New-Item -ItemType Directory -Force -Path $profile | Out-Null

try {
  Write-Host "Edge: $edge"
  Write-Host "Harness: $uri"

  $args = @(
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--disable-default-apps',
    '--allow-file-access-from-files',
    "--user-data-dir=$profile",
    '--dump-dom',
    $uri
  )

  $proc = Start-Process -FilePath $edge -ArgumentList $args -NoNewWindow -PassThru -Wait -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  $text = if (Test-Path $stdout) { [System.IO.File]::ReadAllText($stdout, [System.Text.Encoding]::UTF8) } else { '' }
  $errText = if (Test-Path $stderr) { [System.IO.File]::ReadAllText($stderr, [System.Text.Encoding]::UTF8) } else { '' }

  Write-Host "Edge exit code: $($proc.ExitCode)"
  if ($errText) {
    Write-Host 'Edge stderr:'
    Write-Host $errText
  }

  if ($text -notmatch 'FRAME_GUARD_TEST_PASS') {
    Write-Host 'Edge DOM output:'
    Write-Host $text
    throw 'FRAME browser guard harness failed'
  }

  Write-Host 'FRAME browser guard harness PASS'
}
finally {
  Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue
  Remove-Item -Force $stdout,$stderr -ErrorAction SilentlyContinue
}
