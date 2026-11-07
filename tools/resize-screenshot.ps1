<#
  Shrinks a screenshot below the 2000px limit so it can actually be attached.
  Usage:  powershell -File tools/resize-screenshot.ps1 "C:\path\to\shot.png" [maxWidth]
#>
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [int]$MaxWidth = 1600
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Path)) { Write-Error "Not found: $Path"; exit 1 }

$img = [System.Drawing.Image]::FromFile($Path)
$srcW = $img.Width; $srcH = $img.Height

$scale = [Math]::Min(1.0, $MaxWidth / $srcW)
$w = [int]($srcW * $scale); $h = [int]($srcH * $scale)

$outDir = Join-Path $PSScriptRoot "..\screenshots"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory $outDir | Out-Null }
$out = Join-Path $outDir ("{0}-{1}.png" -f [IO.Path]::GetFileNameWithoutExtension($Path), (Get-Date -Format "HHmmss"))

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, $w, $h)
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $img.Dispose()

Write-Output "${srcW}x${srcH}  ->  ${w}x${h}"
Write-Output (Resolve-Path $out).Path
