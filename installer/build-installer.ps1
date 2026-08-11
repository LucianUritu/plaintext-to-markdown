$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$issFile = Join-Path $PSScriptRoot "PlaintextToMarkdown.iss"
$appExe = Join-Path $repoRoot "dist\app\PlaintextToMarkdown-win32-x64\PlaintextToMarkdown.exe"

if (-not (Test-Path -LiteralPath $appExe)) {
    throw "Packaged app not found at '$appExe'. Run 'npm run package' first."
}

$iscc = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue

if (-not $iscc) {
    $candidatePaths = @(
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    )

    foreach ($candidate in $candidatePaths) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            $iscc = [pscustomobject]@{ Source = $candidate }
            break
        }
    }
}

if (-not $iscc) {
    throw "Inno Setup 6 was not found. Install it from https://jrsoftware.org/isinfo.php, then run this script again."
}

& $iscc.Source $issFile

if ($LASTEXITCODE -ne 0) {
    throw "Inno Setup failed with exit code $LASTEXITCODE."
}

Write-Host "Installer created in: $(Join-Path $repoRoot 'dist\installer')"
