param(
    [string]$SourceBase = 'https://raw.githubusercontent.com/SeanCrawfordDell/EscalationQuality/main/companion',
    [string]$AllowOrigin = ''
)
$ErrorActionPreference = 'Stop'
$stagingDirectory = $null
try {
    $productionSource = 'https://raw.githubusercontent.com/SeanCrawfordDell/EscalationQuality/main/companion'
    if ($SourceBase -ne $productionSource) {
        $sourceUri = [uri]$SourceBase
        $originUri = [uri]$AllowOrigin
        if ($sourceUri.Scheme -ne 'http' -or $sourceUri.Host -notin @('127.0.0.1','localhost') -or
            $sourceUri.AbsolutePath -ne '/companion' -or $sourceUri.Query -or $sourceUri.Fragment -or $sourceUri.UserInfo -or
            $sourceUri.GetLeftPart([UriPartial]::Authority) -ne $AllowOrigin -or
            $originUri.AbsolutePath -ne '/' -or $originUri.Query -or $originUri.Fragment) {
            throw 'Source must be the official repository or an explicitly allowed localhost preview.'
        }
    }
    if ($AllowOrigin) {
        $originUri = [uri]$AllowOrigin
        if ($originUri.Scheme -ne 'http' -or $originUri.Host -notin @('127.0.0.1','localhost') -or
            $originUri.GetLeftPart([UriPartial]::Authority) -ne $AllowOrigin) {
            throw 'Preview origin must be an explicit localhost HTTP origin.'
        }
    }
    $runtime = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $runtime) { throw 'Install Node.js 22 or newer from https://nodejs.org/en/download, then open a new PowerShell window. Copy to AI remains available.' }
    $runtimeVersion = & $runtime.Source -p 'process.versions.node'
    if ($LASTEXITCODE -ne 0 -or [int]($runtimeVersion.Split('.')[0]) -lt 22) { throw 'Update Node.js to version 22 or newer, then open a new PowerShell window.' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $stagingDirectory = Join-Path ([IO.Path]::GetTempPath()) ('EscalationQuality-Devin-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stagingDirectory -ErrorAction Stop | Out-Null
    Write-Host 'Fetching the Devin connection from the EscalationQuality repository. No case data is sent.'
    foreach ($file in @('server.cjs','devin-runner.cjs')) {
        Invoke-WebRequest -Uri ($SourceBase + '/' + $file) -OutFile (Join-Path $stagingDirectory $file) -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    }
    Write-Host 'Keep this window open. Pair using the token below; press Ctrl+C to stop.'
    $serverPath = Join-Path $stagingDirectory 'server.cjs'
    if ($AllowOrigin) { & $runtime.Source $serverPath '--allow-origin' $AllowOrigin }
    else { & $runtime.Source $serverPath }
    if ($LASTEXITCODE -ne 0) { throw 'The connection stopped with an error. Read the message above. Copy to AI remains available.' }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    # This runs inside the user's interactive PowerShell: never exit that host.
    return
} finally {
    if ($stagingDirectory) {
        # Only remove the two exact files created by this invocation; never recurse.
        foreach ($file in @('server.cjs','devin-runner.cjs')) {
            Remove-Item -LiteralPath (Join-Path $stagingDirectory $file) -Force -ErrorAction SilentlyContinue
        }
        try { [IO.Directory]::Delete($stagingDirectory, $false) }
        catch { Write-Warning "Temporary files remain in $stagingDirectory. They were left untouched; no recursive deletion was attempted." }
    }
}
