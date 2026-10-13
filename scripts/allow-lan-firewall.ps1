# Run as Administrator: right-click PowerShell -> "Run as administrator", then:
#   cd D:\Cord\aicord\designtool
#   npm run lan:firewall

$ErrorActionPreference = "Stop"
$ruleName = "Vite designtool 5173"
$port = 5173

$existing = netsh advfirewall firewall show rule name="$ruleName" 2>$null
if ($LASTEXITCODE -eq 0 -and $existing -match "规则名") {
  Write-Host "Firewall rule already exists: $ruleName"
} else {
  netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=$port profile=private,public | Out-Null
  Write-Host "Added firewall rule: allow inbound TCP $port"
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -First 1 -ExpandProperty IPAddress)

Write-Host ""
Write-Host "On this PC:     http://localhost:$port/"
if ($ip) {
  Write-Host "On other PCs:   http://${ip}:$port/"
} else {
  Write-Host "On other PCs:   http://<this-pc-ip>:$port/  (check ipconfig for IPv4)"
}
Write-Host ""
Write-Host "Start dev server: npm run dev:lan"
