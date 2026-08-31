$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourcePath = Join-Path $projectRoot 'native/browser-host'
$cachePath = Join-Path $projectRoot '.cache/browser-host'
$outputPath = Join-Path $projectRoot 'build/browser-host'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vsPath = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vsPath) { throw 'Visual Studio C++ build tools are required' }
$cmake = Join-Path $vsPath 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
& $cmake -S $sourcePath -B $cachePath -A x64
if ($LASTEXITCODE -ne 0) { throw 'Browser host CMake configuration failed' }
& $cmake --build $cachePath --config Release --parallel 2
if ($LASTEXITCODE -ne 0) { throw 'Browser host build failed' }
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
foreach ($channel in @('development', 'stable')) {
  $binary = "daedalus-browser-$channel.exe"
  Copy-Item -LiteralPath (Join-Path $cachePath "Release/$binary") -Destination $outputPath
  & (Join-Path $outputPath $binary) --self-test
  if ($LASTEXITCODE -ne 0) { throw 'Browser host self-test failed' }
}
