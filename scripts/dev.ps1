param(
  [string]$Command = "dev"
)

$VcVars = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
$CargoDir = "$env:USERPROFILE\.cargo\bin"
$NodeDir = "$env:USERPROFILE\nodejs"
$ProjectDir = Split-Path -Parent $PSScriptRoot

$EnvPath = "$NodeDir;$CargoDir;%PATH%"

if ($Command -eq "dev") {
  cmd.exe /c "call `"$VcVars`" > nul && set PATH=$EnvPath && cd /d `"$ProjectDir`" && pnpm tauri dev"
} elseif ($Command -eq "build") {
  cmd.exe /c "call `"$VcVars`" > nul && set PATH=$EnvPath && cd /d `"$ProjectDir`" && pnpm tauri build"
} else {
  cmd.exe /c "call `"$VcVars`" > nul && set PATH=$EnvPath && cd /d `"$ProjectDir`" && pnpm tauri $Command"
}
