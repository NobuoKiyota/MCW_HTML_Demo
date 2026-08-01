# Blender Addon Autoinstaller Script
# Scans all installed Blender versions in AppData and installs/updates fighter_gen_addon.py

$addonFileName = "fighter_gen_addon.py"
$sourcePath = Join-Path $PSScriptRoot $addonFileName

if (-not (Test-Path $sourcePath)) {
    Write-Error "Source addon file not found at: $sourcePath"
    exit 1
}

$blenderAppDataRoot = "C:\Users\kiyot\AppData\Roaming\Blender Foundation\Blender"
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
    
    # Create directory if it doesn't exist
    if (-not (Test-Path $addonDestDir)) {
        New-Item -ItemType Directory -Force -Path $addonDestDir | Out-Null
    }
    
    $destFile = Join-Path $addonDestDir $addonFileName
    Copy-Item $sourcePath $destFile -Force
    Write-Host "Successfully installed addon to Blender ${versionName}: ${destFile}"
}
