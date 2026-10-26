param([string]$ConfigDirectory = (Join-Path $env:USERPROFILE '.config\opencode'))
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path $PSScriptRoot -Parent
$configRoot = [IO.Path]::GetFullPath($ConfigDirectory)
$destination = Join-Path $configRoot 'extensions\opencode-pond'
$cliPath = Join-Path $configRoot 'cli.json'
$cliText = if (Test-Path -LiteralPath $cliPath) { [IO.File]::ReadAllText($cliPath) } else { '{}' }
$config = $cliText | ConvertFrom-Json
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$backup = Join-Path $configRoot "backups\pond-$stamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null
[IO.File]::WriteAllText((Join-Path $backup 'cli.json'), $cliText)
if (Test-Path -LiteralPath $destination) {
  Copy-Item -LiteralPath $destination -Destination (Join-Path $backup 'plugin') -Recurse
}
New-Item -ItemType Directory -Force -Path (Join-Path $destination 'src') | Out-Null
$files = @('tui.ts', 'package.json', 'README.md', 'src\tui.ts', 'src\paint.ts', 'src\pond.ts')
foreach ($file in $files) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination (Join-Path $destination $file)
  if ((Get-FileHash -LiteralPath (Join-Path $sourceRoot $file)).Hash -ne (Get-FileHash -LiteralPath (Join-Path $destination $file)).Hash) {
    throw "Installed file hash mismatch: $file"
  }
}
$sourceEntry = $sourceRoot.Replace('\','/')
$destinationEntry = $destination.Replace('\','/')
$entries = @($config.plugins | Where-Object {
  $null -ne $_ -and $_ -ne $sourceEntry -and $_ -ne $sourceRoot -and $_ -ne $destinationEntry -and $_ -ne $destination
})
$config | Add-Member -Force NoteProperty plugins @($entries + $destinationEntry)
[IO.File]::WriteAllText($cliPath, ($config | ConvertTo-Json -Depth 60))
Write-Output "Installed: $destination"
Write-Output "Backup: $backup"
Write-Output 'Restart OpenCode. Ctrl+P > Pond background.'
