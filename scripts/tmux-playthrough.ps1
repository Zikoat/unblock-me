$ErrorActionPreference = "Stop"

$distro = "Ubuntu-24.04"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$artifactRoot = Join-Path $repositoryRoot "artifacts\tmux"
$bunWindowsPath = (Get-Command bun -ErrorAction Stop).Source
$sessionName = "unblock-me-verify-$PID-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmssfff'))"
$solution = @("A up", "B down", "R right", "R right", "R right", "R right", "R right")
$runRoot = Join-Path $artifactRoot "runs\$sessionName"
$evidenceRoot = Join-Path $runRoot "evidence"
$paneRoot = Join-Path $evidenceRoot "panes"
$runManifestPath = Join-Path $evidenceRoot "manifest.json"
$runTranscriptPath = Join-Path $evidenceRoot "transcript.txt"
$workerResultPath = Join-Path $evidenceRoot "worker-result.json"
$solutionPath = Join-Path $runRoot "solution.json"
$authoritativeManifestPath = Join-Path $artifactRoot "manifest.json"
$authoritativeTranscriptPath = Join-Path $artifactRoot "transcript.txt"
$shimRoot = Join-Path $runRoot "shim"
$shimPath = Join-Path $shimRoot "bun"
$workerPath = Join-Path $PSScriptRoot "tmux-worker.py"
$shimDirectoryCreated = $false
$wslInteropAdded = $false
$tmuxSessionCreated = $false
$mainPathSucceeded = $false
$primaryError = $null
$cleanupFailures = [System.Collections.Generic.List[string]]::new()

$injectedCleanupFailures = @{}
if ($env:UNBLOCK_ME_VERIFY_INJECT_CLEANUP_FAILURES) {
  $env:UNBLOCK_ME_VERIFY_INJECT_CLEANUP_FAILURES.Split(",") | ForEach-Object {
    $injectedCleanupFailures[$_.Trim().ToLowerInvariant()] = $true
  }
}

function ConvertTo-BashLiteral([string]$value) {
  return "'" + $value.Replace("'", "'`"'`"'") + "'"
}

function ConvertTo-WslPath([string]$windowsPath) {
  $wslInput = $windowsPath.Replace("\", "/")
  $output = & wsl.exe -d $distro -- wslpath -a $wslInput 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to convert Windows path to WSL path: $windowsPath`n$($output -join "`n")"
  }
  return ($output -join "`n").Trim()
}

function Invoke-WslBash([string]$command) {
  $encodedCommand = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($command))
  $output = & wsl.exe -d $distro -- bash -lc "printf %s $encodedCommand | base64 --decode | bash" 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "WSL command failed: $command`n$($output -join "`n")"
  }
  return @($output)
}

function Initialize-WslSession([string]$command) {
  $encodedCommand = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($command))
  $output = & wsl.exe -d $distro -- bash -lc "printf %s $encodedCommand | base64 --decode | bash" 2>&1
  $exitCode = $LASTEXITCODE
  $statusLine = @($output) | Where-Object { $_ -match '^__INTEROP_STATUS__=(added|existing)$' } | Select-Object -Last 1
  if ($statusLine -eq "__INTEROP_STATUS__=added") {
    $script:wslInteropAdded = $true
  }
  elseif ($statusLine -eq "__INTEROP_STATUS__=existing") {
    $script:wslInteropAdded = $false
  }
  else {
    throw "WSL session initialization did not report WSLInterop ownership:`n$($output -join "`n")"
  }
  if ($exitCode -ne 0) {
    throw "WSL session initialization failed:`n$($output -join "`n")"
  }
}

function Add-CleanupFailure([string]$message) {
  $cleanupFailures.Add($message)
}

function Invoke-CleanupWslBash([string]$command, [string]$description) {
  Write-Output "cleanup-attempt=$description"
  $encodedCommand = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($command))
  $savedPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & wsl.exe -d $distro -- bash -lc "printf %s $encodedCommand | base64 --decode | bash" 2>&1
    if ($LASTEXITCODE -ne 0) {
      Add-CleanupFailure "$description cleanup failed: $($output -join "`n")"
    }
  }
  catch {
    Add-CleanupFailure "$description cleanup failed: $($_.Exception.Message)"
  }
  finally {
    $ErrorActionPreference = $savedPreference
  }
}

function Invoke-ShimCleanup([string]$description, [bool]$injectFailure) {
  Write-Output "cleanup-attempt=$description"
  try {
    if ($injectFailure) {
      throw "injected shim cleanup failure"
    }
    if (Test-Path -LiteralPath $shimRoot) {
      $expectedShimRoot = [System.IO.Path]::GetFullPath((Join-Path $runRoot "shim"))
      if ([System.IO.Path]::GetFullPath($shimRoot) -ne $expectedShimRoot) {
        throw "shim cleanup refused unexpected path: $shimRoot"
      }
      Remove-Item -LiteralPath $shimRoot -Recurse -Force
    }
  }
  catch {
    Add-CleanupFailure "$description cleanup failed: $($_.Exception.Message)"
  }
}

function Write-Utf8([string]$path, [string]$content) {
  [System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))
}

function Publish-AtomicFile([string]$sourcePath, [string]$destinationPath) {
  $temporaryPath = "$destinationPath.$sessionName.tmp"
  $backupPath = "$destinationPath.$sessionName.bak"
  try {
    [System.IO.File]::Copy($sourcePath, $temporaryPath, $true)
    if (Test-Path -LiteralPath $destinationPath) {
      [System.IO.File]::Replace($temporaryPath, $destinationPath, $backupPath)
    }
    else {
      [System.IO.File]::Move($temporaryPath, $destinationPath)
    }
  }
  finally {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
    if (Test-Path -LiteralPath $backupPath) {
      Remove-Item -LiteralPath $backupPath -Force
    }
  }
}

function Assert-TranscriptContains([string]$transcript, [string]$marker) {
  if (-not $transcript.Contains($marker)) {
    throw "Transcript assertion failed: missing $marker"
  }
}

$distroLockScope = [regex]::Replace($distro, "[^A-Za-z0-9_.-]", "_")
$verificationMutexName = "Local\unblock-me-tmux-distro-$distroLockScope"
$verificationMutex = [System.Threading.Mutex]::new($false, $verificationMutexName)
$lockAcquired = $false
try {
  $lockAcquired = $verificationMutex.WaitOne(0)
}
catch [System.Threading.AbandonedMutexException] {
  $lockAcquired = $true
}
if (-not $lockAcquired) {
  [Console]::Error.WriteLine("Another tmux verification is already running for WSL distribution $distro")
  try { $verificationMutex.Dispose() } catch { }
  exit 1
}

Write-Output "runId=$sessionName verification-started"

try {
  New-Item -ItemType Directory -Force -Path $artifactRoot, $evidenceRoot, $paneRoot, $shimRoot | Out-Null
  $shimDirectoryCreated = $true
  $repositoryWslPath = ConvertTo-WslPath $repositoryRoot
  $bunWslPath = ConvertTo-WslPath $bunWindowsPath
  $shimRootWslPath = ConvertTo-WslPath $shimRoot
  $shimWslPath = ConvertTo-WslPath $shimPath
  $artifactRootWslPath = ConvertTo-WslPath $artifactRoot
  $evidenceRootWslPath = ConvertTo-WslPath $evidenceRoot
  $workerResultWslPath = ConvertTo-WslPath $workerResultPath
  $workerWslPath = ConvertTo-WslPath $workerPath
  Write-Utf8 $solutionPath (($solution | ConvertTo-Json -Compress) + "`n")
  $solutionWslPath = ConvertTo-WslPath $solutionPath

  Write-Utf8 $shimPath "#!/usr/bin/env bash`nexec $(ConvertTo-BashLiteral $bunWslPath) `"`$@`"`n"

  # Keep this literal command in the tmux pane: it is the production entry point under test.
  $paneCommand = "cd $(ConvertTo-BashLiteral $repositoryWslPath) && PATH=$(ConvertTo-BashLiteral $shimRootWslPath):`$PATH bun run start; app_status=`$?; printf '\n__APP_EXIT__=%s\n' `"`$app_status`"; exec bash"
  $newSessionCommand = "tmux new-session -d -s $(ConvertTo-BashLiteral $sessionName) $(ConvertTo-BashLiteral $paneCommand)"
  $initializationCommand = "if [ -e /proc/sys/fs/binfmt_misc/WSLInterop ]; then interop_status=existing; elif printf ':WSLInterop:M::MZ::/init:PF\n' > /proc/sys/fs/binfmt_misc/register 2>/dev/null; then interop_status=added; elif [ -e /proc/sys/fs/binfmt_misc/WSLInterop ]; then interop_status=existing; else exit 1; fi; printf '__INTEROP_STATUS__=%s\n' `"`$interop_status`"; chmod +x $(ConvertTo-BashLiteral $shimWslPath); $(ConvertTo-BashLiteral $bunWslPath) --version >/dev/null; $newSessionCommand"
  Initialize-WslSession $initializationCommand
  $tmuxSessionCreated = $true

  if ($env:UNBLOCK_ME_VERIFY_INJECT_PRIMARY_FAILURE) {
    throw "injected primary verification failure"
  }

  # One long-lived wsl.exe/Python process owns every send and capture in the interaction.
  $workerOutput = & wsl.exe -d $distro -- python3 $workerWslPath `
    --session $sessionName `
    --artifact-root $artifactRootWslPath `
    --evidence-root $evidenceRootWslPath `
    --result $workerResultWslPath `
    --solution-file $solutionWslPath `
    --run-id $sessionName 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Persistent WSL worker failed:`n$($workerOutput -join "`n")"
  }
  Write-Output ($workerOutput -join "`n")

  $workerResult = Get-Content -Raw -LiteralPath $workerResultPath | ConvertFrom-Json
  if ((@($workerResult.solution) -join "`n") -ne ($solution -join "`n")) {
    throw "Worker solution does not match the verifier solution input"
  }
  if ((@($workerResult.executedSolution) -join "`n") -ne ($solution -join "`n")) {
    throw "Worker executed solution does not match the verifier solution input"
  }
  $transcript = Get-Content -Raw -LiteralPath $runTranscriptPath
  Assert-TranscriptContains $transcript "moves=0 won=false"
  1..7 | ForEach-Object { Assert-TranscriptContains $transcript "moves=$_ won=" }
  Assert-TranscriptContains $transcript "moves=7 won=true"
  Assert-TranscriptContains $transcript "YOU WIN"
  Assert-TranscriptContains $transcript "__APP_EXIT__=0"

  $tmuxVersion = ((Invoke-WslBash "tmux -V") -join "`n").Trim()
  $bunVersionOutput = & bun --version 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to read Windows Bun version: $($bunVersionOutput -join "`n")"
  }
  $bunVersion = ($bunVersionOutput -join "`n").Trim()
  $manifest = [ordered]@{
    runId = $sessionName
    distro = $distro
    tmuxVersion = $tmuxVersion
    bunVersion = $bunVersion
    repositoryWslPath = $repositoryWslPath
    bunWslPath = $bunWslPath
    paneCommand = $paneCommand
    solution = $workerResult.solution
    executedSolution = $workerResult.executedSolution
    tmuxCommands = @("bun run verify:tmux", $newSessionCommand) + @($workerResult.tmuxCommands)
    transcriptPath = $workerResult.transcriptPath
    frames = $workerResult.frames
    timing = $workerResult.timing
  } | ConvertTo-Json -Depth 8
  Write-Utf8 $runManifestPath ($manifest + "`n")

  $mainPathSucceeded = $true
  Write-Output "main-path=passed runId=$sessionName"
}
catch {
  $primaryError = $_.Exception.Message
}
finally {
  if ($tmuxSessionCreated) {
    if ($injectedCleanupFailures.ContainsKey("session")) {
      Invoke-CleanupWslBash "printf 'injected tmux session cleanup failure\n' >&2; exit 1" "tmux-session"
      Invoke-CleanupWslBash "tmux kill-session -t $(ConvertTo-BashLiteral $sessionName)" "tmux-session-recovery"
    }
    else {
      Invoke-CleanupWslBash "tmux kill-session -t $(ConvertTo-BashLiteral $sessionName)" "tmux-session"
    }
  }
  else {
    Write-Output "cleanup-attempt=tmux-session skipped-not-created"
  }

  if ($wslInteropAdded) {
    if ($injectedCleanupFailures.ContainsKey("interop")) {
      Invoke-CleanupWslBash "printf 'injected owned WSLInterop cleanup failure\n' >&2; exit 1" "owned-WSLInterop"
      Invoke-CleanupWslBash "if [ -e /proc/sys/fs/binfmt_misc/WSLInterop ]; then printf -- '-1\n' > /proc/sys/fs/binfmt_misc/WSLInterop; fi" "owned-WSLInterop-recovery"
    }
    else {
      Invoke-CleanupWslBash "if [ -e /proc/sys/fs/binfmt_misc/WSLInterop ]; then printf -- '-1\n' > /proc/sys/fs/binfmt_misc/WSLInterop; fi" "owned-WSLInterop"
    }
  }
  else {
    Write-Output "cleanup-attempt=owned-WSLInterop skipped-not-owned"
  }

  if ($shimDirectoryCreated) {
    if ($injectedCleanupFailures.ContainsKey("shim")) {
      Invoke-ShimCleanup "shim" $true
      Invoke-ShimCleanup "shim-recovery" $false
    }
    else {
      Invoke-ShimCleanup "shim" $false
    }
  }
  else {
    Write-Output "cleanup-attempt=shim skipped-not-created"
  }

  Invoke-CleanupWslBash "if tmux has-session -t $(ConvertTo-BashLiteral $sessionName) 2>/dev/null; then printf 'session residue\n' >&2; exit 1; fi" "tmux-session-residue-check"
  if (Test-Path -LiteralPath $shimRoot) {
    Add-CleanupFailure "shim residue remains: $shimRoot"
  }
  if ($wslInteropAdded) {
    Invoke-CleanupWslBash "if [ -e /proc/sys/fs/binfmt_misc/WSLInterop ]; then printf 'owned WSLInterop residue\n' >&2; exit 1; fi" "owned-WSLInterop-residue-check"
  }
  else {
    Write-Output "cleanup-check=owned-WSLInterop not-owned"
  }

}

if (($null -eq $primaryError) -and $cleanupFailures.Count -eq 0 -and $mainPathSucceeded) {
  try {
    # Keep the distro-scoped lock through authoritative evidence publication.
    Publish-AtomicFile $runTranscriptPath $authoritativeTranscriptPath
    Publish-AtomicFile $runManifestPath $authoritativeManifestPath
  }
  catch {
    $primaryError = "Evidence publication failed after successful cleanup: $($_.Exception.Message)"
  }
}

if ($lockAcquired) {
  try {
    $verificationMutex.ReleaseMutex()
  }
  catch {
    Add-CleanupFailure "verification lock release failed: $($_.Exception.Message)"
  }
}
try {
  $verificationMutex.Dispose()
}
catch {
  Add-CleanupFailure "verification lock disposal failed: $($_.Exception.Message)"
}

if ($null -ne $primaryError) {
  [Console]::Error.WriteLine("Primary verification failure: $primaryError")
}
if ($cleanupFailures.Count -gt 0) {
  [Console]::Error.WriteLine("Cleanup failed while preserving the primary result:")
  $cleanupFailures | ForEach-Object { [Console]::Error.WriteLine(" - $_") }
}

if (($null -ne $primaryError) -or $cleanupFailures.Count -gt 0 -or -not $mainPathSucceeded) {
  exit 1
}

$timing = (Get-Content -Raw -LiteralPath $runManifestPath | ConvertFrom-Json).timing
Write-Output "runId=$sessionName $tmuxVersion moves=7 won=true YOU WIN __APP_EXIT__=0 captureSpanMs=$($timing.captureSpanMs) videoFrameTotalMs=$($timing.totalFrameDurationMs)"
exit 0
