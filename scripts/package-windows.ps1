param([ValidateSet('x64', 'arm64')][string]$Architecture = 'x64', [string]$NodeVersion = '24.22.3')
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$releaseRoot = Join-Path $projectRoot 'release'
$stage = Join-Path $releaseRoot "tlcf-abc-$($package.version)-windows-$Architecture"
$cache = Join-Path $projectRoot '.research/runtime-cache'
New-Item -ItemType Directory -Path $releaseRoot,$cache -Force | Out-Null
$archiveName = "node-v$NodeVersion-win-$Architecture.zip"
$archivePath = Join-Path $cache $archiveName
$baseUrl = "https://nodejs.org/dist/v$NodeVersion"
$hashes = (Invoke-WebRequest "$baseUrl/SHASUMS256.txt" -UseBasicParsing).Content
$line = ($hashes -split "`n" | Where-Object { $_.Trim().EndsWith("  $archiveName") })
if (-not $line) { throw 'Official Node.js checksum is missing.' }
$expected = ($line.Trim() -split '\s+')[0]
if (-not (Test-Path -LiteralPath $archivePath)) { Invoke-WebRequest "$baseUrl/$archiveName" -OutFile $archivePath -UseBasicParsing }
$actual = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw 'Node.js archive checksum mismatch. No release was created.' }
$extracted = Join-Path $cache "node-v$NodeVersion-win-$Architecture"
if (-not (Test-Path -LiteralPath (Join-Path $extracted 'node.exe'))) { Expand-Archive -LiteralPath $archivePath -DestinationPath $cache -Force }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist/src/server.js'))) { throw 'Run npm run build first.' }
# Recreate only the explicitly verified staging directory inside this project's release folder.
if (Test-Path -LiteralPath $stage) {
  $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
  $resolvedRelease = (Resolve-Path -LiteralPath $releaseRoot).Path
  if (-not $resolvedStage.StartsWith($resolvedRelease + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging path.' }
  Remove-Item -LiteralPath $resolvedStage -Recurse -Force
}
New-Item -ItemType Directory -Path $stage,(Join-Path $stage 'runtime'),(Join-Path $stage 'docs') -Force | Out-Null
foreach ($directory in @('bin','dist','public')) { Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination $stage -Recurse }
foreach ($file in @('package.json','README.md','LICENSE','start.cmd')) { Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $stage }
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs/feasibility.md') -Destination (Join-Path $stage 'docs')
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs/distribution.md') -Destination (Join-Path $stage 'docs')
Copy-Item -LiteralPath (Join-Path $extracted 'node.exe') -Destination (Join-Path $stage 'runtime/node.exe')
Copy-Item -LiteralPath (Join-Path $extracted 'LICENSE') -Destination (Join-Path $stage 'runtime/NODE-LICENSE.txt')
@{
  product = 'ABC - Agent Budget Console'; version = $package.version
  platform = "windows-$Architecture"; nodeVersion = $NodeVersion
  nodeArchiveUrl = "$baseUrl/$archiveName"; nodeArchiveSha256 = $expected
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'runtime/manifest.json') -Encoding UTF8
$zip = "$stage.zip"
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
$zipHash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
$checksumsPath = Join-Path $releaseRoot 'SHA256SUMS.txt'
$existing = if (Test-Path -LiteralPath $checksumsPath) { Get-Content -LiteralPath $checksumsPath | Where-Object { $_ -notmatch [regex]::Escape([System.IO.Path]::GetFileName($zip)) } } else { @() }
@($existing) + "$zipHash  $([System.IO.Path]::GetFileName($zip))" | Set-Content -LiteralPath $checksumsPath -Encoding ASCII
Write-Output "Windows ZIP ready: $zip"
