$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$binaryDir = Join-Path $repoRoot 'src-tauri\binaries'
$tempDir = Join-Path $env:TEMP 'videodowngrade-ffmpeg'
$zipPath = Join-Path $tempDir 'ffmpeg.zip'
$extractDir = Join-Path $tempDir 'extract'
$url = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'

New-Item -ItemType Directory -Force -Path $binaryDir | Out-Null
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

Write-Host 'Downloading FFmpeg essentials...'
Invoke-WebRequest -Uri $url -OutFile $zipPath
Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

$ffmpeg = Get-ChildItem -Path $extractDir -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1
$ffprobe = Get-ChildItem -Path $extractDir -Recurse -Filter 'ffprobe.exe' | Select-Object -First 1
if (-not $ffmpeg -or -not $ffprobe) { throw 'FFmpeg archive did not contain ffmpeg.exe and ffprobe.exe' }

Copy-Item $ffmpeg.FullName (Join-Path $binaryDir 'ffmpeg-x86_64-pc-windows-msvc.exe') -Force
Copy-Item $ffprobe.FullName (Join-Path $binaryDir 'ffprobe-x86_64-pc-windows-msvc.exe') -Force

Write-Host 'FFmpeg sidecars prepared for x86_64-pc-windows-msvc.'
