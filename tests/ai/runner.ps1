$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScenariosPath = Join-Path $Root 'scenarios.json'
$FixturePath = Join-Path $Root 'fixture_context.json'
$BaseUrl = if ($env:FRAME_AI_URL) { $env:FRAME_AI_URL.TrimEnd('/') } else { 'http://127.0.0.1:8787' }
$Token = [Environment]::GetEnvironmentVariable('FRAME_AI_TOKEN','Machine')
if ([string]::IsNullOrWhiteSpace($Token)) { throw 'FRAME_AI_TOKEN is missing from Machine environment' }

function Normalize([object]$Value) {
    return ([string]$Value).ToLowerInvariant().Replace('ё','е')
}

function Collect-Text([object]$Data) {
    $parts = New-Object System.Collections.Generic.List[string]
    if ($null -eq $Data) { return '' }
    foreach ($name in @('summary','text','message','answer','error')) {
        $p = $Data.PSObject.Properties[$name]
        if ($p -and $p.Value -is [string]) { $parts.Add([string]$p.Value) }
    }
    $actionsProp = $Data.PSObject.Properties['actions']
    if ($actionsProp -and $actionsProp.Value) {
        $parts.Add(($actionsProp.Value | ConvertTo-Json -Depth 20 -Compress))
    }
    return ($parts -join "`n")
}

function Find-NumberRecursive([object]$Value, [double]$Expected) {
    if ($null -eq $Value) { return $false }
    if ($Value -is [byte] -or $Value -is [int16] -or $Value -is [int32] -or $Value -is [int64] -or $Value -is [single] -or $Value -is [double] -or $Value -is [decimal]) {
        return ([double]$Value -eq $Expected)
    }
    if ($Value -is [string]) { return $false }
    if ($Value -is [System.Collections.IDictionary]) {
        foreach ($v in $Value.Values) { if (Find-NumberRecursive $v $Expected) { return $true } }
        return $false
    }
    if ($Value -is [System.Collections.IEnumerable]) {
        foreach ($v in $Value) { if (Find-NumberRecursive $v $Expected) { return $true } }
        return $false
    }
    foreach ($p in $Value.PSObject.Properties) {
        if (Find-NumberRecursive $p.Value $Expected) { return $true }
    }
    return $false
}

function Invoke-FrameAnalyze([string]$Text, [object]$Context) {
    $headers = @{ Authorization = "Bearer $Token" }
    $body = @{ text = $Text; context = $Context } | ConvertTo-Json -Depth 30
    return Invoke-RestMethod -Method Post -Uri "$BaseUrl/analyze" -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 180
}

function Check-Expect([object]$Data, [object]$Expect) {
    $errors = New-Object System.Collections.Generic.List[string]
    $text = Normalize (Collect-Text $Data)

    foreach ($x in @($Expect.must_reference)) {
        if (-not $x) { continue }
        if (-not $text.Contains((Normalize $x))) { $errors.Add("нет ожидаемого фрагмента: $x") }
    }
    foreach ($x in @($Expect.must_not_reference)) {
        if (-not $x) { continue }
        if ($text.Contains((Normalize $x))) { $errors.Add("запрещённый фрагмент: $x") }
    }

    $actions = @()
    $ap = $Data.PSObject.Properties['actions']
    if ($ap -and $ap.Value) { $actions = @($ap.Value) }

    if ($Expect.PSObject.Properties['action_required']) {
        if ($Expect.action_required -eq $true -and $actions.Count -eq 0) { $errors.Add('ожидался action, но actions пуст') }
        if ($Expect.action_required -eq $false -and $actions.Count -gt 0) { $errors.Add('не ожидался action, но actions присутствуют') }
    }

    if ($actions.Count -gt 0 -and $Expect.action_type) {
        $found = $false
        foreach ($a in $actions) { if ($a.type -eq $Expect.action_type) { $found = $true; break } }
        if (-not $found) { $errors.Add("нет action типа $($Expect.action_type)") }
    }

    foreach ($field in @('quantity','unit_price','total')) {
        $p = $Expect.PSObject.Properties[$field]
        if ($p -and $actions.Count -gt 0) {
            if (-not (Find-NumberRecursive $actions ([double]$p.Value))) {
                $errors.Add("не найдено числовое значение $field=$($p.Value) внутри actions")
            }
        }
    }
    return $errors
}

$suite = Get-Content $ScenariosPath -Raw | ConvertFrom-Json
$fixture = Get-Content $FixturePath -Raw | ConvertFrom-Json
$passed = 0
$total = @($suite.scenarios).Count
Write-Host "FRAME AI Test Suite: $total сценариев"
Write-Host "AI Server: $BaseUrl"
Write-Host ''

foreach ($sc in $suite.scenarios) {
    try {
        $conversation = @()
        $last = $null
        foreach ($msg in $sc.messages) {
            $context = ($fixture | ConvertTo-Json -Depth 30 | ConvertFrom-Json)
            $target = if ($sc.conversation_target) { $sc.conversation_target } else { $fixture.conversation_target }
            $context.current_target = $target
            $context.conversation_target = $target
            $context | Add-Member -NotePropertyName conversation -NotePropertyValue $conversation -Force
            $context | Add-Member -NotePropertyName conversation_rules -NotePropertyValue @(
                'Stay on conversation_target until the user explicitly names another object.',
                'Recent user facts in conversation are newer than stored progress until actions are applied.',
                'Never switch to another object/order merely because it exists in context.'
            ) -Force

            $last = Invoke-FrameAnalyze $msg $context
            $conversation += [pscustomobject]@{ role='user'; content=$msg }
            $conversation += [pscustomobject]@{ role='assistant'; content=(Collect-Text $last) }
        }

        $errors = @(Check-Expect $last $sc.expect)
        if ($errors.Count -eq 0) {
            $passed++
            Write-Host "PASS $($sc.id) - $($sc.title)"
        } else {
            Write-Host "FAIL $($sc.id) - $($sc.title)"
            foreach ($e in $errors) { Write-Host "  - $e" }
            Write-Host "  response: $($last | ConvertTo-Json -Depth 20 -Compress)"
        }
    } catch {
        Write-Host "ERROR $($sc.id) - $($sc.title)"
        Write-Host "  - $($_.Exception.Message)"
    }
}

Write-Host ''
Write-Host "RESULT: $passed/$total passed"
if ($passed -ne $total) { exit 1 }
