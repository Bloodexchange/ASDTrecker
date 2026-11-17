$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
Write-Host 'CurrencyAPI update interval: 60 / 900 / 3600 / 86400 seconds. Choose the interval included in your plan.'
$rateInterval = Read-Host 'Interval (Enter = 86400)'
if ([string]::IsNullOrWhiteSpace($rateInterval)) { $rateInterval = '86400' }
if ($rateInterval -notin @('60','900','3600','86400')) { throw 'Unsupported interval' }
$rateSecret = Read-Host 'Paste CurrencyAPI key (hidden; never saved to a file)' -AsSecureString
$ratePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($rateSecret)
try {
    $rateProcessInfo = New-Object System.Diagnostics.ProcessStartInfo
    $rateProcessInfo.FileName = (Get-Command node).Source
    $rateProcessInfo.Arguments = "scripts/configure-rates.mjs $rateInterval"
    $rateProcessInfo.UseShellExecute = $false
    $rateProcessInfo.RedirectStandardInput = $true
    $rateProcessInfo.CreateNoWindow = $true
    $rateProcess = [System.Diagnostics.Process]::Start($rateProcessInfo)
    $rateProcess.StandardInput.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ratePointer))
    $rateProcess.StandardInput.Close()
    $rateProcess.WaitForExit()
    if ($rateProcess.ExitCode -ne 0) { throw 'Configuration did not finish. Check the message above.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ratePointer)
    $rateSecret.Dispose()
}
