param(
    [Parameter(Mandatory = $true)][string]$BackendDirectory,
    [Parameter(Mandatory = $true)][string]$ExpectedDatabase,
    [Parameter(Mandatory = $true)][string]$LogFile,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
# Dedicated variables are configured by the authorized task10 service account.
# No .env parsing, target default, credential output or automatic activation.
if (-not $env:LIFECYCLE_DATABASE_URL) { throw 'LIFECYCLE_DATABASE_URL is required' }
if ($Apply -and ($env:FULFILLMENT_SIMULATION_ENABLED -ne 'true' -or
        $env:APP_ENV -notin @('development', 'dev', 'test', 'demo'))) {
    throw 'Apply requires the shared fulfillment simulation guard'
}
Set-Location -LiteralPath $BackendDirectory
$packageBWorkerPython = Join-Path $BackendDirectory '.venv/Scripts/python.exe'
$packageBWorkerArguments = @('-m', 'scripts.run_lifecycle_jobs', '--url-env', 'LIFECYCLE_DATABASE_URL',
    '--target', $ExpectedDatabase, '--environment', 'local', '--batch-size', '100', '--max-batches', '10')
if ($Apply) { $packageBWorkerArguments += @('--apply', '--confirm-target', $ExpectedDatabase) }
# One-shot; Task Scheduler invokes every five minutes. Preserve failure exit code.
& $packageBWorkerPython @packageBWorkerArguments 2>&1 | Out-File -FilePath $LogFile -Append -Encoding utf8
exit $LASTEXITCODE
