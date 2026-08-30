$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$cachePath = Join-Path $projectRoot '.cache/computer'
$outputPath = Join-Path $projectRoot 'build/computer-observation'
$sourcePath = Join-Path $projectRoot 'native/computer-observation'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vsPath = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vsPath) { throw 'Visual Studio C++ build tools are required' }
$cmake = Join-Path $vsPath 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
$ortPath = Join-Path $cachePath 'ort'
Expand-Archive -LiteralPath (Join-Path $cachePath 'ort.zip') -DestinationPath $ortPath -Force
& $cmake -S $sourcePath -B (Join-Path $cachePath 'cmake') -A x64 "-DORT_ROOT=$ortPath"
if ($LASTEXITCODE -ne 0) { throw 'CMake configuration failed' }
& $cmake --build (Join-Path $cachePath 'cmake') --config Release --parallel 2
if ($LASTEXITCODE -ne 0) { throw 'Native helper build failed' }
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
Copy-Item -LiteralPath (Join-Path $cachePath 'cmake/Release/daedalus-computer-helper.exe') -Destination $outputPath
Get-ChildItem -LiteralPath (Join-Path $ortPath 'runtimes/win-x64/native') -Filter '*.dll' | Copy-Item -Destination $outputPath
Get-ChildItem -LiteralPath $ortPath -File | Where-Object { $_.Name -match 'LICENSE|NOTICE' } | Copy-Item -Destination $outputPath
& (Join-Path $outputPath 'daedalus-computer-helper.exe') --self-test
if ($LASTEXITCODE -ne 0) { throw 'Native helper self-test failed' }
