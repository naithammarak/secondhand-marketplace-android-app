param([int]$Port = 8765, [string]$PublicOrigin = '')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pgRoot = Join-Path $env:TEMP 'inspect01pg'
$pgCtl = Join-Path $pgRoot 'pgsql\bin\pg_ctl.exe'
$psql = Join-Path $pgRoot 'pgsql\bin\psql.exe'
$createdb = Join-Path $pgRoot 'pgsql\bin\createdb.exe'
$python = Join-Path $root 'backend\.venv\Scripts\python.exe'
$data = Join-Path $pgRoot 'data'
if (!(Test-Path -LiteralPath $pgCtl) -or !(Test-Path -LiteralPath $python)) {
  throw 'Local PostgreSQL or backend Python environment is missing.'
}
$ip = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*' -and $_.InterfaceAlias -notmatch 'vEthernet|Virtual'
} | Select-Object -First 1 -ExpandProperty IPAddress
if (!$ip) { throw 'No LAN IPv4 address found. Connect the PC and phone to the same Wi-Fi.' }
& $pgCtl -D $data status *> $null
if ($LASTEXITCODE -ne 0) {
  & $pgCtl -D $data -l (Join-Path $pgRoot 'server.log') start
  if ($LASTEXITCODE -ne 0) { throw 'Could not start local PostgreSQL' }
}
$existing = & $psql -h 127.0.0.1 -p 55433 -U inspect -d template1 -At -c "SELECT datname FROM pg_database WHERE datname = 'inspect_demo_local'"
if ($LASTEXITCODE -ne 0) { throw 'Could not query local PostgreSQL' }
if (!$existing) {
  & $createdb -h 127.0.0.1 -p 55433 -U inspect inspect_demo_local
  if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated demo database' }
}
$env:DATABASE_URL = 'postgresql+psycopg://inspect@127.0.0.1:55433/inspect_demo_local'
$env:APP_ENV = 'development'
$env:INSPECT_DEMO_ENABLED = 'true'
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$env:INSPECT_DEMO_JWT_SECRET = [BitConverter]::ToString($bytes).Replace('-', '')
$codeBytes = New-Object byte[] 6
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($codeBytes)
$env:INSPECT_DEMO_ACCESS_CODE = [BitConverter]::ToString($codeBytes).Replace('-', '').ToLowerInvariant()
$env:SUPABASE_JWT_SECRET = $env:INSPECT_DEMO_JWT_SECRET
$env:SUPABASE_JWT_ISSUER = 'https://inspect-demo.local/auth/v1'
$env:SUPABASE_JWT_ALGORITHM = 'HS256'
$env:PAYMENT_SIMULATION_ENABLED = 'true'
$env:CERT_PUBLIC_ORIGIN = if ($PublicOrigin) { $PublicOrigin.TrimEnd('/') } else { "http://${ip}:${Port}" }
$env:INSPECT_PRIVATE_STORAGE_DIR = Join-Path $env:TEMP 'inspect-demo-private-evidence'
New-Item -ItemType Directory -Force -Path $env:INSPECT_PRIVATE_STORAGE_DIR | Out-Null
Push-Location (Join-Path $root 'backend')
try {
  & $python -m alembic upgrade head
  if ($LASTEXITCODE -ne 0) { throw 'Demo migration failed' }
  & $python -m scripts.seed_inspect_demo
  if ($LASTEXITCODE -ne 0) { throw 'Demo seed failed' }
  Write-Host "Demo API: http://${ip}:${Port}"
  Write-Host "Demo code: $env:INSPECT_DEMO_ACCESS_CODE"
  Write-Host 'Keep this terminal open while trying the app.'
  & $python -m uvicorn app.main:app --host 0.0.0.0 --port $Port
} finally { Pop-Location }
