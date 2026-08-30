$ErrorActionPreference = 'Stop'
try {
    $taskCommand = $env:DAEDALUS_MANAGED_COMMAND | ConvertFrom-Json
    Remove-Item Env:DAEDALUS_MANAGED_COMMAND
    Add-Type -Path (Join-Path $PSScriptRoot 'windows-process-job.cs')
    $taskExitCode = [DaedalusProcessJob]::Run($taskCommand.executable, [string[]]$taskCommand.args, $taskCommand.cwd)
    exit $taskExitCode
} catch {
    [Console]::Error.WriteLine('[dev-supervisor] Windows process supervision failed: ' + $_.Exception.Message)
    exit 1
}
