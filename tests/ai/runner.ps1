$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScenariosPath = Join-Path $Root 'scenarios.json'
$FixturePath = Join-Path $Root 'fixture_context.json'
$BaseUrl = if ($env:FRAME_AI_URL) { $env:FRAME_AI_URL.TrimEnd('/') } else { 'http://127.0.0.1:8787' }
$Token = [Environment]::GetEnvironmentVariable('FRAME_AI_TOKEN','Machine')
if ([string]::IsNullOrWhiteSpace($Token)) { throw 'FRAME_AI_TOKEN is missing from Machine environment' }

function Read-Utf8Json([string]$Path) {
    $text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
    return ($text | ConvertFrom-Json)
}

function Normalize([object]$Value) {
    return ([string]$Value).ToLowerInvariant()
}

function Get-Payload([object]$Data) {
    if ($null -eq $Data) { return $null }
    $resultProp = $Data.PSObject.Properties['result']
    if ($resultProp -and $null -ne $resultProp.Value) { return $resultProp.Value }
    return $Data
}

function Collect-Text([object]$Data) {
    $Data = Get-Payload $Data
    $parts = New-Object System.Collections.Generic.List[string]
    if ($null -eq $Data) { return '' }
    foreach ($name in @('summary','text','message','answer','error','clarification','claration')) {
        $p = $Data.PSObject.Properties[$name]
        if ($p -and $p.Value -is [string] -and -not [string]::IsNullOrWhiteSpace($p.Value)) { $parts.Add([string]$p.Value) }
    }
    $actionsProp = $Data.PSObject.Properties['actions']
    if ($actionsProp -and $actionsProp.Value) {
        $parts.Add(($actionsProp.Value | ConvertTo-Json -Depth 20 -Compress))
    }
    return ($parts -join "`n")
}

function Build-GuardedText([string]$Text, [string]$Target, [object[]]$Conversation) {
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add('[FRAME INTERNAL CONTEXT]')
    if (-not [string]::IsNullOrWhiteSpace($Target)) { $lines.Add("Active object: $Target") }
    $lines.Add('Rules:')
    $lines.Add('- The active object is authoritative until the user explicitly names another object.')
    $lines.Add('- Recent user statements are newer than stored progress until the user applies changes.')
    $lines.Add('- If the user corrects or contradicts an earlier statement, the newest explicit statement is authoritative. Do not ask for clarification when the correction itself is clear.')
    $lines.Add('- Words such as no, actually, correction, not installed, not done, cancel that, and I was wrong can explicitly replace an earlier fact.')
    $lines.Add('- For an explicit create/add/update/delete request, return structured actions, not prose only.')
    $lines.Add('- For an add-work request, return an add_work action with quantity, unit price and total when they are stated.')

    $recent = @($Conversation | Where-Object { $_.role -eq 'user' -and -not [string]::IsNullOrWhiteSpace([string]$_.content) } | Select-Object -Last 8)
    if ($recent.Count -gt 0) {
        $lines.Add('Recent user statements, oldest to newest:')
        foreach ($m in $recent) { $lines.Add("- $([string]$m.content)") }
        $lines.Add('Resolve contradictions by recency: the newest explicit user statement wins.')
    }
    $lines.Add('[CURRENT USER REQUEST]')
    $lines.Add($Text)
    $lines.Add('The current user request is the newest statement and has highest priority when it corrects earlier conversation facts.')
    return ($lines -join "`n")
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
    $json = @{ text = $Text; context = $Context } | ConvertTo-Json -Depth 30
    $body = [System.Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod -Method Post -Uri "$BaseUrl/analyze" -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 180
}

function Check-Expect([object]$Data, [object]$Expect) {
    $Data = Get-Payload $Data
    $errors = New-Object System.Collections.Generic.List[string]
    $text = Normalize (Collect-Text $Data)

    foreach ($x in @($Expect.must_reference)) {
        if (-not $x) { continue }
        if (-not $text.Contains((Normalize $x))) { $errors.Add("missing expected fragment: $x") }
    }

    $anyProp = $Expect.PSObject.Properties['must_reference_any']
    if ($anyProp -and $anyProp.Value) {
        $foundAny = $false
        foreach ($x in @($anyProp.Value)) {
            if ($x -and $text.Contains((Normalize $x))) { $foundAny = $true; break }
        }
        if (-not $foundAny) {
            $errors.Add("missing all equivalent expected fragments: $(@($anyProp.Value) -join ' OR ')")
        }
    }

    foreach ($x in @($Expect.must_not_reference)) {
        if (-not $x) { continue }
        if ($text.Contains((Normalize $x))) { $errors.Add("forbidden fragment found: $x") }
    }

    $actions = @()
    $ap = $Data.PSObject.Properties['actions']
    if ($ap -and $ap.Value) { $actions = @($ap.Value) }

    if ($Expect.PSObject.Properties['action_required']) {
        if ($Expect.action_required -eq $true -and $actions.Count -eq 0) { $errors.Add('expected action but actions are empty') }
        if ($Expect.action_required -eq $false -and $actions.Count -gt 0) { $errors.Add('unexpected action returned') }
    }

    if ($actions.Count -gt 0 -and $Expect.action_type) {
        $found = $false
        foreach ($a in $actions) { if ($a.type -eq $Expect.action_type) { $found = $true; break } }
        if (-not $found) { $errors.Add("missing action type $($Expect.action_type)") }
    }

    foreach ($field in @('quantity','unit_price','total')) {
        $p = $Expect.PSObject.Properties[$field]
        if ($p -and $actions.Count -gt 0) {
            if (-not (Find-NumberRecursive $actions ([double]$p.Value))) {
                $errors.Add("numeric value not found: $field=$($p.Value)")
            }
        }
    }
    return $errors
}

$suite = Read-Utf8Json $ScenariosPath
$fixture = Read-Utf8Json $FixturePath
$passed = 0
$total = @($suite.scenarios).Count
Write-Host "FRAME AI Test Suite: $total scenarios"
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
                'When recent user statements conflict, the newest explicit statement is authoritative and replaces the older fact.',
                'A clear correction or negation is not ambiguous and must not trigger a clarification question.',
                'Never switch to another object/order merely because it exists in context.'
            ) -Force

            $guarded = Build-GuardedText $msg $target $conversation
            $last = Invoke-FrameAnalyze $guarded $context
            $conversation += [pscustomobject]@{ role='user'; content=$msg }
            $conversation += [pscustomobject]@{ role='assistant'; content=(Collect-Text $last) }
        }

        $errors = @(Check-Expect $last $sc.expect)
        if ($errors.Count -eq 0) {
            $passed++
            Write-Host "PASS $($sc.id)"
        } else {
            Write-Host "FAIL $($sc.id)"
            foreach ($e in $errors) { Write-Host "  - $e" }
            Write-Host "  response: $($last | ConvertTo-Json -Depth 20 -Compress)"
        }
    } catch {
        Write-Host "ERROR $($sc.id)"
        Write-Host "  - $($_.Exception.Message)"
    }
}

Write-Host ''
Write-Host "RESULT: $passed/$total passed"
if ($passed -ne $total) { exit 1 }
