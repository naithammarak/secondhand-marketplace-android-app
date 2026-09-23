param([int]$ApiPort = 8765, [string]$PublicApiOrigin = '', [switch]$Tunnel)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$ip = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*' -and $_.InterfaceAlias -notmatch 'vEthernet|Virtual'
} | Select-Object -First 1 -ExpandProperty IPAddress
if (!$ip) { throw 'No LAN IPv4 address found.' }
$api = if ($PublicApiOrigin) { $PublicApiOrigin.TrimEnd('/') } else { "http://${ip}:${ApiPort}" }
try { $health = Invoke-RestMethod -Uri "$api/health" -TimeoutSec 5 } catch { throw "Demo API is unavailable at $api. Start start-inspect-demo-api.ps1 first." }
if ($health.status -ne 'ok') { throw 'Demo API health failed.' }
$env:EXPO_PUBLIC_API_BASE_URL = $api
$env:EXPO_PUBLIC_INSPECT_DEMO = 'true'
Push-Location (Join-Path $root 'mobile')
try {
  Write-Host "Demo app uses $api. Keep this terminal open and scan the Expo QR code."
  if ($Tunnel) { & npx expo start --go --tunnel }
  else { & npx expo start --go --lan }
} finally { Pop-Location }
