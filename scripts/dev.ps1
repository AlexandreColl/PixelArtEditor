param(
  [string]$Command = "dev"
)

$VcVars = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
$CargoDir = "$env:USERPROFILE\.cargo\bin"
$NodeDir = "$env:USERPROFILE\nodejs"
$ProjectDir = Split-Path -Parent $PSScriptRoot
# Signs the updater artifacts; never in the repository (see CONTRIBUTING.md, Releases)
$SigningKey = "$env:USERPROFILE\.tauri\pixel-art-editor.key"

$EnvPath = "$NodeDir;$CargoDir;%PATH%"

if ($Command -eq "dev") {
  cmd.exe /c "call `"$VcVars`" > nul && set PATH=$EnvPath && cd /d `"$ProjectDir`" && pnpm tauri dev"
} elseif ($Command -eq "build") {
  if (-not $env:TAURI_SIGNING_PRIVATE_KEY -and (Test-Path $SigningKey)) {
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw $SigningKey
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
  }
  if ($env:TAURI_SIGNING_PRIVATE_KEY) {
    cmd.exe /c "call `"$VcVars`" > nul && set PATH=$EnvPath && cd /d `"$ProjectDir`" && pnpm tauri build"
  } else {
    # Without the key the installers are built, but not the signed update packages
    Write-Host "No updater signing key: building the installers without update packages"
    cmd.exe /c "call `"$VcVars`" > nul && set PATH=$EnvPath && cd /d `"$ProjectDir`" && pnpm tauri build --config src-tauri/tauri.no-updater.conf.json"
  }
} else {
  cmd.exe /c "call `"$VcVars`" > nul && set PATH=$EnvPath && cd /d `"$ProjectDir`" && pnpm tauri $Command"
}
