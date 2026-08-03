# Blender Addon Autoinstaller Script
# Scans all installed Blender versions in AppData and installs/updates fighter_gen_addon.py.
# A plain Blender restart is enough to pick up the change afterward (Blender reloads every
# enabled addon fresh from disk at startup) -- no manual disable/enable in Preferences needed.

$addonFileName = "fighter_gen_addon.py"
$sourcePath = Join-Path $PSScriptRoot $addonFileName

if (-not (Test-Path $sourcePath)) {
    Write-Error "Source addon file not found at: $sourcePath"
    exit 1
}

$blenderAppDataRoot = Join-Path $env:APPDATA "Blender Foundation\Blender"
if (-not (Test-Path $blenderAppDataRoot)) {
    Write-Warning "Blender AppData directory not found at $blenderAppDataRoot. Skip automatic installation."
    exit 0
}

$versions = Get-ChildItem $blenderAppDataRoot | Where-Object { $_.PSIsContainer }

if ($versions.Count -eq 0) {
    Write-Warning "No Blender version folders found in AppData."
    exit 0
}

foreach ($v in $versions) {
    $versionName = $v.Name
    # Blender addon path structure: AppData\Roaming\Blender Foundation\Blender\[Version]\scripts\addons\
    $addonDestDir = Join-Path $blenderAppDataRoot "$versionName\scripts\addons"

    if (-not (Test-Path $addonDestDir)) {
        New-Item -ItemType Directory -Force -Path $addonDestDir | Out-Null
    }

    $destFile = Join-Path $addonDestDir $addonFileName
    Copy-Item $sourcePath $destFile -Force

    # Defensively clear any cached bytecode so Blender can't accidentally load a stale
    # compiled version (Python normally re-checks mtime and recompiles anyway, but this
    # removes any doubt).
    $pycacheDir = Join-Path $addonDestDir "__pycache__"
    if (Test-Path $pycacheDir) {
        Remove-Item (Join-Path $pycacheDir "fighter_gen_addon.*.pyc") -Force -ErrorAction SilentlyContinue
    }

    Write-Host "Installed addon to Blender ${versionName}: ${destFile}"
}

Write-Host ""
Write-Host "Done. Restart Blender to load the updated addon (no manual re-enable needed)."
