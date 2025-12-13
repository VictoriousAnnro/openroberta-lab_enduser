# PowerShell script to start OpenRoberta with Cloudflare Tunnel

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting OpenRoberta with Cloudflare Tunnel" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if WSL is available
$wslCheck = Get-Command wsl -ErrorAction SilentlyContinue
if (-not $wslCheck) {
    Write-Host "ERROR: WSL not found!" -ForegroundColor Red
    Write-Host "Please install WSL first: wsl --install" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if cloudflared is installed
$cloudflaredCheck = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflaredCheck) {
    Write-Host "ERROR: cloudflared not found!" -ForegroundColor Red
    Write-Host "Installing cloudflared..." -ForegroundColor Yellow
    winget install --id Cloudflare.cloudflared --silent
    Write-Host "Please restart this script after installation completes." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Step 1: Starting OpenRoberta Lab Server..." -ForegroundColor Green
Write-Host ""

# Start OpenRoberta in a new window
$openrobertaCmd = "wsl bash -c 'cd /mnt/c/Users/jimda/Desktop/openRoberta1/openroberta-lab_enduser && ./ora.sh start-from-git'"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $openrobertaCmd -WindowStyle Normal

Write-Host "Waiting 15 seconds for OpenRoberta to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

Write-Host ""
Write-Host "Step 2: Starting MuJoCo Flask API..." -ForegroundColor Green
Write-Host ""

# Start Flask API in a new window
$flaskCmd = "wsl bash -c 'cd /mnt/c/Users/jimda/Desktop/openRoberta1/openroberta-lab_enduser/mj_pick_and_place && source venv/bin/activate && flask --app app.py run'"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $flaskCmd -WindowStyle Normal

Write-Host "Waiting 10 seconds for API to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "Step 3: Testing local servers..." -ForegroundColor Green

# Test if servers are running
$openrobertaRunning = Test-NetConnection -ComputerName localhost -Port 1999 -InformationLevel Quiet -WarningAction SilentlyContinue
$apiRunning = Test-NetConnection -ComputerName localhost -Port 5000 -InformationLevel Quiet -WarningAction SilentlyContinue

if ($openrobertaRunning) {
    Write-Host "✓ OpenRoberta Server is running on port 1999" -ForegroundColor Green
} else {
    Write-Host "⚠ Warning: OpenRoberta Server may not be running yet (port 1999)" -ForegroundColor Yellow
}

if ($apiRunning) {
    Write-Host "✓ Flask API is running on port 5000" -ForegroundColor Green
} else {
    Write-Host "⚠ Warning: Flask API may not be running yet (port 5000)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 4: Starting Cloudflare Tunnel..." -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "IMPORTANT: Copy the URL shown below!" -ForegroundColor Yellow
Write-Host "Share this URL with anyone to access your OpenRoberta Lab" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Start cloudflare tunnel
cloudflared tunnel --url http://localhost:1999

Write-Host ""
Write-Host "Tunnel closed." -ForegroundColor Yellow
Write-Host ""
Write-Host "The OpenRoberta and API servers are still running in other windows." -ForegroundColor Yellow
Write-Host "Close those windows to stop the servers." -ForegroundColor Yellow
Read-Host "Press Enter to exit"
