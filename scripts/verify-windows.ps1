$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$archive = Join-Path $projectRoot "release/ABC-$($package.version)-windows-x64.zip"
$destination = Join-Path $projectRoot ".research/zip verification $([guid]::NewGuid().ToString('N'))"
Expand-Archive -LiteralPath $archive -DestinationPath $destination
$runtime = Join-Path $destination 'runtime/node.exe'
$cli = Join-Path $destination 'bin/abc.js'
$reported = & $runtime $cli --version
if ($reported -ne "ABC $($package.version)") { throw 'Bundled runtime version command failed.' }
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
$previousPath = $env:PATH
$previousData = $env:ABC_DATA_DIR
$env:ABC_DATA_DIR = Join-Path $destination 'test-user-data'
# Prove the embedded runtime works without a Node.js installation or provider CLIs on PATH.
$env:PATH = "$env:SystemRoot/System32;$env:SystemRoot/System32/WindowsPowerShell/v1.0"
$origin = "http://127.0.0.1:$port"
$process = Start-Process -FilePath $runtime -ArgumentList @('"' + $cli + '"', '--no-open', '--port', $port) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $destination 'stdout.log') -RedirectStandardError (Join-Path $destination 'stderr.log')
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try { $response = Invoke-WebRequest -Uri "$origin/api/state" -UseBasicParsing; $ready = $true; break } catch { Start-Sleep -Milliseconds 150 }
  }
  if (-not $ready) { throw 'Extracted Windows ZIP did not start.' }
  $state = $response.Content | ConvertFrom-Json
  if (@($state.accounts).Count -ne 0) { throw 'User data was unexpectedly included in the ZIP.' }
  $html = (Invoke-WebRequest -Uri $origin -UseBasicParsing).Content
  if ($html -notmatch 'Agent Budget Console') { throw 'Dashboard assets are missing.' }
  $headers = @{ Origin = $origin; 'X-Quota-Desk' = $state.token }
  $profilePath = Join-Path $destination 'fake provider profile'
  New-Item -ItemType Directory -Path $profilePath | Out-Null
  '{"theme":"original"}' | Set-Content -LiteralPath (Join-Path $profilePath 'settings.json') -Encoding UTF8
  $attachBody = @{ provider = 'antigravity'; name = 'ZIP verification'; profilePath = $profilePath } | ConvertTo-Json
  $attached = (Invoke-WebRequest -Uri "$origin/api/accounts" -Method Post -Headers $headers -ContentType 'application/json' -Body $attachBody -UseBasicParsing).Content | ConvertFrom-Json
  Invoke-WebRequest -Uri "$origin/api/accounts/$($attached.id)/enable-collector" -Method Post -Headers $headers -ContentType 'application/json' -Body '{}' -UseBasicParsing | Out-Null
  $settings = Get-Content -LiteralPath (Join-Path $profilePath 'settings.json') -Raw | ConvertFrom-Json
  $command = $settings.statusLine.command -split ' '
  $payload = '{"email":"zip@example.test","quota":{"weekly":{"remaining_fraction":0.75,"reset_time":"2030-01-01T00:00:00Z"}}}'
  $output = $payload | & $command[0] $command[1] $command[2] $command[3] $command[4]
  if ($output -notmatch '75%') { throw 'ZIP collector failed with a spaced installation path.' }
  Invoke-WebRequest -Uri "$origin/api/accounts/$($attached.id)/disable-collector" -Method Post -Headers $headers -ContentType 'application/json' -Body '{}' -UseBasicParsing | Out-Null
  $restored = Get-Content -LiteralPath (Join-Path $profilePath 'settings.json') -Raw | ConvertFrom-Json
  if ($restored.theme -ne 'original' -or $restored.statusLine) { throw 'ZIP monitoring undo failed.' }
  Write-Output 'Extracted Windows ZIP verified without installed Node.js: launch, dashboard assets, local state, collector paths with spaces, monitoring undo.'
} finally {
  Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
  $env:PATH = $previousPath
  $env:ABC_DATA_DIR = $previousData
}
