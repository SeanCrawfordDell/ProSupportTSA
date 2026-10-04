param(
    # The site passes the exact commit to fetch from; a moving branch is never accepted.
    [string]$SourceBase = '',
    [string]$AllowOrigin = ''
)
$ErrorActionPreference = 'Stop'
$stagingDirectory = $null
try {
    # SHA-256 of the runtime files committed alongside this script. tests/devin-integration.test.cjs keeps them in step.
    $expectedHashes = @{
        'server.cjs'       = '2c2b0656ed03214ca50fd2eec5d5fe69606440eea1e618706a6cffd87dd0dc25'
        'devin-runner.cjs' = '0d73faf8713bb53e3700d6a43ed439bb01922a0f07a6f92080c63389f90cb3e8'
    }
    $runtime = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $runtime) { throw 'Install Node.js 22 or newer from https://nodejs.org/en/download, then open a new PowerShell window. Copy to AI remains available.' }
    $runtimeVersion = & $runtime.Source -p 'process.versions.node'
    if ($LASTEXITCODE -ne 0 -or [int]($runtimeVersion.Split('.')[0]) -lt 22) { throw 'Update Node.js to version 22 or newer, then open a new PowerShell window.' }
    if (-not $SourceBase) { throw 'Copy the full connection command from Case Notes > AI Settings; it names the exact version to download.' }
    $pinnedSource = $SourceBase -match '^https://raw\.githubusercontent\.com/SeanCrawfordDell/EscalationQuality/[0-9a-f]{40}/companion$'
    if (-not $pinnedSource) {
        $sourceUri = [uri]$SourceBase
        $originUri = [uri]$AllowOrigin
        if ($sourceUri.Scheme -ne 'http' -or $sourceUri.Host -notin @('127.0.0.1','localhost') -or
            $sourceUri.AbsolutePath -ne '/companion' -or $sourceUri.Query -or $sourceUri.Fragment -or $sourceUri.UserInfo -or
            $sourceUri.GetLeftPart([UriPartial]::Authority) -ne $AllowOrigin -or
            $originUri.AbsolutePath -ne '/' -or $originUri.Query -or $originUri.Fragment) {
            throw 'Source must be a pinned commit of the official repository or an explicitly allowed localhost preview.'
        }
    }
    if ($AllowOrigin) {
        $originUri = [uri]$AllowOrigin
        if ($originUri.Scheme -ne 'http' -or $originUri.Host -notin @('127.0.0.1','localhost') -or
            $originUri.GetLeftPart([UriPartial]::Authority) -ne $AllowOrigin) {
            throw 'Preview origin must be an explicit localhost HTTP origin.'
        }
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $stagingDirectory = Join-Path ([IO.Path]::GetTempPath()) ('EscalationQuality-Devin-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stagingDirectory -ErrorAction Stop | Out-Null
    Write-Host 'Fetching the Devin connection from the EscalationQuality repository. No case data is sent.'
    foreach ($file in @('server.cjs','devin-runner.cjs')) {
        $target = Join-Path $stagingDirectory $file
        Invoke-WebRequest -Uri ($SourceBase + '/' + $file) -OutFile $target -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        # Localhost previews serve the developer's own working copy, so only the published source is checksummed.
        if ($pinnedSource -and (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHashes[$file]) {
            throw "Downloaded $file does not match the expected checksum. Nothing was run. Copy to AI remains available."
        }
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
