# Clank CLI — PowerShell installer
# Usage: irm https://raw.githubusercontent.com/ItsTrag1c/Clank-Chat/cli/install.ps1 | iex

$ErrorActionPreference = "Stop"

$repo = "ItsTrag1c/Clank-Chat"
$installDir = Join-Path $HOME "ClankCLI"

Write-Host ""
Write-Host "  Clank CLI Installer" -ForegroundColor DarkYellow
Write-Host ""

# 1. Query GitHub API for latest release
Write-Host "  Fetching latest release..." -ForegroundColor Gray
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{ "User-Agent" = "ClankCLI-Installer" }
$tag = $release.tag_name -replace "^v", ""
Write-Host "  Found v$tag" -ForegroundColor Gray

# 2. Find the standalone EXE asset (ClankCLI_X.Y.Z.exe)
$asset = $release.assets | Where-Object { $_.name -match "^ClankCLI_[\d.]+\.exe$" } | Select-Object -First 1
if (-not $asset) {
    Write-Host "  Error: Could not find standalone EXE in release assets." -ForegroundColor Red
    exit 1
}

# 3. Create install directory
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

# 4. Download the EXE
$exePath = Join-Path $installDir "ClankCLI.exe"
Write-Host "  Downloading $($asset.name) ($([math]::Round($asset.size / 1MB, 1)) MB)..." -ForegroundColor Gray
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $exePath -UseBasicParsing

# 5. Write clank.cmd
$cmdPath = Join-Path $installDir "clank.cmd"
$cmdContent = "@echo off`r`n`"%~dp0ClankCLI.exe`" %*"
Set-Content -Path $cmdPath -Value $cmdContent -Encoding ASCII

# 6. Add to user PATH if not already present
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$installDir*") {
    $newPath = if ($userPath) { "$userPath;$installDir" } else { $installDir }
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Host "  Added to user PATH." -ForegroundColor Gray
}

Write-Host ""
Write-Host "  Clank CLI v$tag installed to $installDir" -ForegroundColor Green
Write-Host ""
Write-Host "  Open a new terminal and type: clank" -ForegroundColor DarkYellow
Write-Host ""
