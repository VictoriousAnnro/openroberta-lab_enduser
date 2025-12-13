@echo off
echo ========================================
echo Starting OpenRoberta with Cloudflare Tunnel
echo ========================================
echo.

echo Step 1: Starting OpenRoberta Lab Server...
echo.
start "OpenRoberta Server" wsl bash -c "cd /mnt/c/Users/jimda/Desktop/openRoberta1/openroberta-lab_enduser && ./ora.sh start-from-git"

echo Waiting 10 seconds for OpenRoberta to initialize...
timeout /t 10 /nobreak > nul

echo.
echo Step 2: Starting MuJoCo Flask API...
echo.
start "MuJoCo API" wsl bash -c "cd /mnt/c/Users/jimda/Desktop/openRoberta1/openroberta-lab_enduser/mj_pick_and_place && source venv/bin/activate && flask --app app.py run"

echo Waiting 5 seconds for API to start...
timeout /t 5 /nobreak > nul

echo.
echo Step 3: Starting Cloudflare Tunnel...
echo.
echo ========================================
echo IMPORTANT: Copy the URL shown below!
echo Share this URL with anyone to access your OpenRoberta Lab
echo ========================================
echo.

cloudflared tunnel --url http://localhost:1999

echo.
echo Tunnel closed.
pause
