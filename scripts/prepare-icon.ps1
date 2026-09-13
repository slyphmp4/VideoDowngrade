$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $repoRoot 'src-tauri\icons'
$source = Join-Path $iconsDir 'icon.png'
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

$bitmap = New-Object System.Drawing.Bitmap 1024, 1024
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(255, 9, 10, 13))

$lime = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 217, 255, 67))
$dark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 24, 27, 34))
$graphics.FillEllipse($dark, 190, 190, 644, 644)

$points = [System.Drawing.Point[]]@(
  [System.Drawing.Point]::new(260, 390),
  [System.Drawing.Point]::new(395, 390),
  [System.Drawing.Point]::new(512, 570),
  [System.Drawing.Point]::new(629, 390),
  [System.Drawing.Point]::new(764, 390),
  [System.Drawing.Point]::new(512, 720)
)
$graphics.FillPolygon($lime, $points)

$bitmap.Save($source, [System.Drawing.Imaging.ImageFormat]::Png)
$lime.Dispose()
$dark.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "Generated $source"
