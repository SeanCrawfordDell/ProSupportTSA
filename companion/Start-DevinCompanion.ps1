param([string]$AllowOrigin = '')
$ErrorActionPreference = 'Stop'
try {
    $runtime = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $runtime) { throw 'Install Node.js 22 or newer from https://nodejs.org/en/download, then open a new PowerShell window.' }
    $runtimeVersion = & $runtime.Source -p 'process.versions.node'
    if ([int]($runtimeVersion.Split('.')[0]) -lt 22) { throw 'Update Node.js to version 22 or newer, then open a new PowerShell window.' }
    $devinExecutable = Get-Command devin.exe -ErrorAction SilentlyContinue
    if (-not $devinExecutable) {
        Write-Warning 'Devin CLI is not on PATH. Install it using https://docs.devin.ai/cli and open a new terminal. The companion can start, but Copy to AI will be needed until Devin is available.'
    }
    $serverPath = Join-Path $PSScriptRoot 'server.cjs'
    if ($AllowOrigin) { & $runtime.Source $serverPath '--allow-origin' $AllowOrigin }
    else { & $runtime.Source $serverPath }
    if ($LASTEXITCODE -ne 0) { throw 'The companion could not stay running. Read the message above, check port 43127, and retry.' }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
