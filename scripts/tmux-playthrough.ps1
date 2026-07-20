$ErrorActionPreference = "Stop"

$distro = "Ubuntu-24.04"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$artifactRoot = Join-Path $repositoryRoot "artifacts\tmux"
$bunWindowsPath = (Get-Command bun -ErrorAction Stop).Source
$sessionName = "unblock-me-verify-$PID-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmssfff'))"
$solution = @("A up", "B down", "R right", "R right", "R right", "R right", "R right")
$frames = [System.Collections.Generic.List[object]]::new()
$transcriptSections = [System.Collections.Generic.List[string]]::new()
$runRoot = Join-Path $artifactRoot "runs\$sessionName"
$evidenceRoot = Join-Path $runRoot "evidence"
$paneRoot = Join-Path $evidenceRoot "panes"
$runManifestPath = Join-Path $evidenceRoot "manifest.json"
$runTranscriptPath = Join-Path $evidenceRoot "transcript.txt"
$authoritativeManifestPath = Join-Path $artifactRoot "manifest.json"
$authoritativeTranscriptPath = Join-Path $artifactRoot "transcript.txt"
$shimRoot = Join-Path $runRoot "shim"
$shimPath = Join-Path $shimRoot "bun"
$shimDirectoryCreated = $false
$wslInteropAdded = $false
$tmuxSessionCreated = $false

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

function Enable-WslInterop {
  $status = ((Invoke-WslBash "if [ -e /proc/sys/fs/binfmt_misc/WSLInterop ]; then printf existing; elif printf ':WSLInterop:M::MZ::/init:PF\n' > /proc/sys/fs/binfmt_misc/register 2>/dev/null; then printf added; elif [ -e /proc/sys/fs/binfmt_misc/WSLInterop ]; then printf existing; else exit 1; fi") -join "`n").Trim()
  if ($status -eq "added") { return $true }
  if ($status -eq "existing") { return $false }
  throw "Unexpected WSLInterop state: $status"
}

function Invoke-CleanupWslBash([string]$command, [string]$description) {
  $encodedCommand = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($command))
  $cleanupErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & wsl.exe -d $distro -- bash -lc "printf %s $encodedCommand | base64 --decode | bash" 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "$description cleanup failed: $($output -join "`n")"
    }
  }
  catch {
    Write-Warning "$description cleanup failed: $_"
  }
  finally {
    $ErrorActionPreference = $cleanupErrorActionPreference
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
      try {
        Remove-Item -LiteralPath $temporaryPath -Force
      }
      catch {
        Write-Warning "Atomic publication cleanup failed: $_"
      }
    }
    if (Test-Path -LiteralPath $backupPath) {
      try {
        Remove-Item -LiteralPath $backupPath -Force
      }
      catch {
        Write-Warning "Atomic publication backup cleanup failed: $_"
      }
    }
  }
}

function Capture-Frame([string]$label, [int]$durationMs) {
  Start-Sleep -Milliseconds $durationMs
  $capturedLines = Invoke-WslBash "tmux capture-pane -p -t $(ConvertTo-BashLiteral "$sessionName`:0.0")"
  $timestamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssfffZ")
  $frameNumber = $frames.Count + 1
  $fileName = "{0:D3}-{1}-{2}.txt" -f $frameNumber, $timestamp, ($label -replace "[^A-Za-z0-9-]", "-")
  $framePath = Join-Path $paneRoot $fileName
  $frameText = ($capturedLines -join "`n") + "`n"
  Write-Utf8 $framePath $frameText
  $relativePath = $framePath.Substring($artifactRoot.Length + 1).Replace("\", "/")
  $frames.Add([ordered]@{ label = $label; path = $relativePath; durationMs = $durationMs })
  $transcriptSections.Add("--- $label ---`n$frameText")
}

function Assert-TranscriptContains([string]$marker) {
  $transcript = $transcriptSections -join "`n"
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
  try {
    $verificationMutex.Dispose()
  }
  catch {
    Write-Warning "Verification lock disposal failed: $_"
  }
  exit 1
}

$exitCode = 1
try {
  New-Item -ItemType Directory -Force -Path $artifactRoot, $evidenceRoot, $paneRoot, $shimRoot | Out-Null
  $shimDirectoryCreated = $true
  $repositoryWslPath = ConvertTo-WslPath $repositoryRoot
  $bunWslPath = ConvertTo-WslPath $bunWindowsPath
  $shimRootWslPath = ConvertTo-WslPath $shimRoot
  $shimWslPath = ConvertTo-WslPath $shimPath
  $wslInteropAdded = Enable-WslInterop
  Write-Utf8 $shimPath "#!/usr/bin/env bash`nexec $(ConvertTo-BashLiteral $bunWslPath) `"`$@`"`n"
  Invoke-WslBash "chmod +x $(ConvertTo-BashLiteral $shimWslPath)" | Out-Null

  $paneCommand = "cd $(ConvertTo-BashLiteral $repositoryWslPath) && PATH=$(ConvertTo-BashLiteral $shimRootWslPath):`$PATH bun run start; app_status=`$?; printf '\n__APP_EXIT__=%s\n' `"`$app_status`"; exec bash"
  Invoke-WslBash "tmux new-session -d -s $(ConvertTo-BashLiteral $sessionName) $(ConvertTo-BashLiteral $paneCommand)" | Out-Null
  $tmuxSessionCreated = $true

  Capture-Frame "initial" 1000
  for ($moveIndex = 0; $moveIndex -lt $solution.Count; $moveIndex += 1) {
    $line = $solution[$moveIndex]
    for ($characterIndex = 0; $characterIndex -lt $line.Length; $characterIndex += 1) {
      $character = $line[$characterIndex]
      Invoke-WslBash "tmux send-keys -t $(ConvertTo-BashLiteral "$sessionName`:0.0") -l $(ConvertTo-BashLiteral $character)" | Out-Null
      Capture-Frame "move-$($moveIndex + 1)-char-$($characterIndex + 1)" 80
    }
    Invoke-WslBash "tmux send-keys -t $(ConvertTo-BashLiteral "$sessionName`:0.0") Enter" | Out-Null
    Capture-Frame "move-$($moveIndex + 1)-submitted" 700
  }
  Capture-Frame "won-hold" 1500

  $transcript = $transcriptSections -join "`n"
  Write-Utf8 $runTranscriptPath $transcript
  Assert-TranscriptContains "moves=0 won=false"
  1..7 | ForEach-Object { Assert-TranscriptContains "moves=$_ won=" }
  Assert-TranscriptContains "moves=7 won=true"
  Assert-TranscriptContains "YOU WIN"
  Assert-TranscriptContains "__APP_EXIT__=0"

  $tmuxVersion = ((Invoke-WslBash "tmux -V") -join "`n").Trim()
  $bunVersionOutput = & bun --version 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to read Windows Bun version: $($bunVersionOutput -join "`n")"
  }
  $bunVersion = ($bunVersionOutput -join "`n").Trim()
  $transcriptRelativePath = $runTranscriptPath.Substring($artifactRoot.Length + 1).Replace("\", "/")
  $manifest = [ordered]@{
    runId = $sessionName
    distro = $distro
    tmuxVersion = $tmuxVersion
    bunVersion = $bunVersion
    repositoryWslPath = $repositoryWslPath
    bunWslPath = $bunWslPath
    transcriptPath = $transcriptRelativePath
    frames = $frames
  } | ConvertTo-Json -Depth 5
  Write-Utf8 $runManifestPath ($manifest + "`n")
  Publish-AtomicFile $runTranscriptPath $authoritativeTranscriptPath
  Publish-AtomicFile $runManifestPath $authoritativeManifestPath

  Write-Output "$tmuxVersion moves=7 won=true YOU WIN __APP_EXIT__=0"
  $exitCode = 0
}
catch {
  [Console]::Error.WriteLine($_.Exception.Message)
}
finally {
  if ($tmuxSessionCreated) {
    Invoke-CleanupWslBash "tmux kill-session -t $(ConvertTo-BashLiteral $sessionName)" "tmux session $sessionName"
  }
  if ($wslInteropAdded) {
    Invoke-CleanupWslBash "if [ -e /proc/sys/fs/binfmt_misc/WSLInterop ]; then printf -- '-1\n' > /proc/sys/fs/binfmt_misc/WSLInterop; fi" "WSLInterop handler"
  }
  if ($shimDirectoryCreated -and (Test-Path -LiteralPath $shimRoot)) {
    try {
      Remove-Item -LiteralPath $shimRoot -Recurse -Force
    }
    catch {
      Write-Warning "Shim directory cleanup failed: $_"
    }
  }
  if ($lockAcquired) {
    try {
      $verificationMutex.ReleaseMutex()
    }
    catch {
      Write-Warning "Verification lock cleanup failed: $_"
    }
  }
  try {
    $verificationMutex.Dispose()
  }
  catch {
    Write-Warning "Verification lock disposal failed: $_"
  }
}

exit $exitCode
