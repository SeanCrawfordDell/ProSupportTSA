$ErrorActionPreference = 'Stop'
$repoDirectory = Split-Path -Parent $PSScriptRoot
$companionDirectory = Join-Path $repoDirectory 'companion'
$downloadDirectory = Join-Path $repoDirectory 'downloads'
New-Item -ItemType Directory -Path $downloadDirectory -Force | Out-Null
$packageFiles = @('server.cjs', 'devin-runner.cjs', 'Start-DevinCompanion.ps1', 'README.md') |
    ForEach-Object { Join-Path $companionDirectory $_ }
Compress-Archive -LiteralPath $packageFiles -DestinationPath (Join-Path $downloadDirectory 'DevinCompanion.zip') -Force
Write-Host 'Windows companion package created: downloads/DevinCompanion.zip'
