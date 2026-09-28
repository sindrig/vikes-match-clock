param(
    [string]$BinaryPath = "$PSScriptRoot/../src-tauri/target/release/vikes-match-clock.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BinaryPath -PathType Leaf)) {
    throw "Kiosk executable not found: $BinaryPath"
}

$vswhere = "${env:ProgramFiles(x86)}/Microsoft Visual Studio/Installer/vswhere.exe"
$dumpbinPaths = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find "VC/Tools/MSVC/**/bin/Hostx64/x64/dumpbin.exe"
if ($LASTEXITCODE -ne 0 -or -not $dumpbinPaths) {
    throw "Could not locate dumpbin.exe in the Visual Studio C++ build tools."
}
$dumpbin = @($dumpbinPaths)[0]

$dependencies = & $dumpbin /DEPENDENTS $BinaryPath 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "dumpbin failed for ${BinaryPath}: $($dependencies -join "`n")"
}
$dependencies | Write-Output
if (-not ($dependencies | Select-String -Pattern '(?i)\bkernel32\.dll\b')) {
    throw "dumpbin did not report the expected Windows executable imports."
}

# Match normal and delay-loaded imports. Windows system DLLs are allowed;
# the separately installed Visual C++ runtime must be linked statically.
$runtimeImports = $dependencies | Select-String -Pattern '(?i)\b(?:vcruntime\d+[^\s]*|msvcp\d+[^\s]*|msvcr\d+[^\s]*|concrt\d+[^\s]*)\.dll\b'
if ($runtimeImports) {
    throw "Kiosk still depends on Visual C++ runtime DLLs: $($runtimeImports -join ', ')"
}

Write-Output "Verified: kiosk has no Visual C++ runtime DLL imports."
