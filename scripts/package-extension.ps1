param(
  [string]$OutputDir = "dist",
  [string]$PackageName = "paper-scorecard-extension.zip"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$outputPath = Join-Path $root $OutputDir
$zipPath = Join-Path $outputPath $PackageName
$stagingPath = Join-Path $outputPath "paper-scorecard-extension"

if (Test-Path $stagingPath) {
  Remove-Item -LiteralPath $stagingPath -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stagingPath | Out-Null
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$include = @(
  "manifest.json",
  "README.md",
  "LICENSE",
  "icons",
  "src",
  "vendor",
  "assets"
)

foreach ($item in $include) {
  $source = Join-Path $root $item
  if (Test-Path $source) {
    Copy-Item -LiteralPath $source -Destination $stagingPath -Recurse -Force
  }
}

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $stagingPath "*") -DestinationPath $zipPath -Force
Write-Host "Created $zipPath"

