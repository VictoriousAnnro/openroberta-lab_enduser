# OpenRoberta Deployment Helper Script
# Run this on your LOCAL Windows machine

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "OpenRoberta Lab Deployment Helper" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if user has a server
Write-Host "Do you have a cloud server already? (yes/no): " -ForegroundColor Yellow -NoNewline
$hasServer = Read-Host

if ($hasServer -ne "yes") {
    Write-Host ""
    Write-Host "You need to create a cloud server first!" -ForegroundColor Red
    Write-Host "Please read: deploy\GET_SERVER_FIRST.md" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Quick options:" -ForegroundColor Green
    Write-Host "1. Oracle Cloud (Free): https://www.oracle.com/cloud/free/" -ForegroundColor White
    Write-Host "2. DigitalOcean ($200 credit): https://www.digitalocean.com" -ForegroundColor White
    Write-Host "3. AWS (Free 12 months): https://aws.amazon.com/free/" -ForegroundColor White
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit
}

# Get server IP
Write-Host ""
Write-Host "Enter your server IP address: " -ForegroundColor Yellow -NoNewline
$serverIP = Read-Host

if ([string]::IsNullOrWhiteSpace($serverIP)) {
    Write-Host "Error: Server IP is required!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit
}

# Validate IP format (basic)
if ($serverIP -notmatch '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$') {
    Write-Host "Warning: This doesn't look like a valid IP address!" -ForegroundColor Yellow
    Write-Host "Are you sure? (yes/no): " -NoNewline
    $confirm = Read-Host
    if ($confirm -ne "yes") {
        exit
    }
}

Write-Host ""
Write-Host "Testing SSH connection to $serverIP..." -ForegroundColor Cyan

# Test SSH connection
$testSSH = ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no ubuntu@$serverIP "echo 'Connection successful'" 2>$null

if ($LASTEXITCODE -ne 0) {
    Write-Host "Cannot connect to server via SSH!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible issues:" -ForegroundColor Yellow
    Write-Host "1. Wrong IP address" -ForegroundColor White
    Write-Host "2. Server firewall blocking SSH (port 22)" -ForegroundColor White
    Write-Host "3. Wrong SSH key" -ForegroundColor White
    Write-Host "4. Wrong username (should be 'ubuntu')" -ForegroundColor White
    Write-Host ""
    Write-Host "Try manually:" -ForegroundColor Yellow
    Write-Host "ssh ubuntu@$serverIP" -ForegroundColor White
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit
}

Write-Host "✓ SSH connection successful!" -ForegroundColor Green
Write-Host ""

# Ask about deployment method
Write-Host "Choose deployment method:" -ForegroundColor Cyan
Write-Host "1. Automatic - I'll guide you through commands" -ForegroundColor White
Write-Host "2. Manual - Show me all commands to copy/paste" -ForegroundColor White
Write-Host ""
Write-Host "Enter choice (1 or 2): " -ForegroundColor Yellow -NoNewline
$choice = Read-Host

if ($choice -eq "1") {
    # Automatic guided deployment
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Starting Automatic Deployment" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Upload deployment scripts
    Write-Host "Step 1: Uploading deployment scripts..." -ForegroundColor Cyan
    scp -r deploy ubuntu@${serverIP}:/tmp/
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Scripts uploaded successfully!" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to upload scripts" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit
    }
    
    Write-Host ""
    Write-Host "Step 2: Running deployment script on server..." -ForegroundColor Cyan
    Write-Host "(This will take a few minutes...)" -ForegroundColor Yellow
    ssh ubuntu@$serverIP "chmod +x /tmp/deploy/deploy-no-domain.sh && /tmp/deploy/deploy-no-domain.sh"
    
    Write-Host ""
    Write-Host "Step 3: Do you want to upload your project code now? (yes/no): " -ForegroundColor Yellow -NoNewline
    $uploadCode = Read-Host
    
    if ($uploadCode -eq "yes") {
        Write-Host ""
        Write-Host "Creating project archive..." -ForegroundColor Cyan
        
        # Use WSL to create tar if available, otherwise skip
        $hasWSL = Get-Command wsl -ErrorAction SilentlyContinue
        
        if ($hasWSL) {
            $currentPath = (Get-Location).Path
            $wslPath = $currentPath -replace '\\', '/' -replace 'C:', '/mnt/c'
            
            Write-Host "Using WSL to create archive..." -ForegroundColor Cyan
            wsl bash -c "cd '$wslPath' && tar --exclude='target' --exclude='venv' --exclude='node_modules' --exclude='.git' -czf /tmp/openroberta.tar.gz ."
            
            Write-Host "Uploading project archive (this may take a while)..." -ForegroundColor Cyan
            scp /tmp/openroberta.tar.gz ubuntu@${serverIP}:/opt/openroberta/
            
            Write-Host "Extracting on server..." -ForegroundColor Cyan
            ssh ubuntu@$serverIP "cd /opt/openroberta && tar -xzf openroberta.tar.gz && rm openroberta.tar.gz"
            
            Write-Host "✓ Project uploaded!" -ForegroundColor Green
        } else {
            Write-Host "WSL not found. Please use one of these methods:" -ForegroundColor Yellow
            Write-Host "1. Use WinSCP or FileZilla to upload files to /opt/openroberta/" -ForegroundColor White
            Write-Host "2. Set up git and clone your repository on the server" -ForegroundColor White
        }
    }
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Next Steps - Run on Server" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Connect to your server:" -ForegroundColor Yellow
    Write-Host "ssh ubuntu@$serverIP" -ForegroundColor White
    Write-Host ""
    Write-Host "Then run these commands:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "cd /opt/openroberta" -ForegroundColor White
    Write-Host "mvn clean install -DskipTests" -ForegroundColor White
    Write-Host "cd mj_pick_and_place" -ForegroundColor White
    Write-Host "python3 -m venv venv" -ForegroundColor White
    Write-Host "source venv/bin/activate" -ForegroundColor White
    Write-Host "pip install -r requirements.txt" -ForegroundColor White
    Write-Host "deactivate" -ForegroundColor White
    Write-Host ""
    Write-Host "# Update CORS" -ForegroundColor White
    Write-Host "nano /opt/openroberta/mj_pick_and_place/app.py" -ForegroundColor White
    Write-Host "# Change: cors = CORS(app, origins=['*'])" -ForegroundColor White
    Write-Host ""
    Write-Host "# Install services" -ForegroundColor White
    Write-Host "sudo cp /tmp/deploy/openroberta.service /etc/systemd/system/" -ForegroundColor White
    Write-Host "sudo cp /tmp/deploy/mujoco-api.service /etc/systemd/system/" -ForegroundColor White
    Write-Host "sudo systemctl daemon-reload" -ForegroundColor White
    Write-Host "sudo systemctl enable openroberta mujoco-api" -ForegroundColor White
    Write-Host "sudo systemctl start openroberta mujoco-api" -ForegroundColor White
    Write-Host ""
    Write-Host "# Setup Nginx (optional)" -ForegroundColor White
    Write-Host "sudo cp /tmp/deploy/nginx-no-domain.conf /etc/nginx/sites-available/openroberta" -ForegroundColor White
    Write-Host "sudo ln -s /etc/nginx/sites-available/openroberta /etc/nginx/sites-enabled/" -ForegroundColor White
    Write-Host "sudo rm -f /etc/nginx/sites-enabled/default" -ForegroundColor White
    Write-Host "sudo nginx -t" -ForegroundColor White
    Write-Host "sudo systemctl restart nginx" -ForegroundColor White
    Write-Host ""
    
} else {
    # Manual commands
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Manual Deployment Commands" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Your Server IP: $serverIP" -ForegroundColor Green
    Write-Host ""
    Write-Host "Copy and paste these commands:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "# 1. Upload deployment scripts" -ForegroundColor Green
    Write-Host "scp -r deploy ubuntu@${serverIP}:/tmp/" -ForegroundColor White
    Write-Host ""
    Write-Host "# 2. SSH into server" -ForegroundColor Green
    Write-Host "ssh ubuntu@$serverIP" -ForegroundColor White
    Write-Host ""
    Write-Host "# 3. Run deployment script" -ForegroundColor Green
    Write-Host "chmod +x /tmp/deploy/deploy-no-domain.sh" -ForegroundColor White
    Write-Host "/tmp/deploy/deploy-no-domain.sh" -ForegroundColor White
    Write-Host ""
    Write-Host "# 4. Upload your project (choose one method)" -ForegroundColor Green
    Write-Host "# Method A: Git clone" -ForegroundColor White
    Write-Host "cd /opt/openroberta" -ForegroundColor White
    Write-Host "git clone YOUR_REPO_URL ." -ForegroundColor White
    Write-Host ""
    Write-Host "# Method B: Or create and upload tar from local machine" -ForegroundColor White
    Write-Host "# (Run in WSL/Git Bash on local machine)" -ForegroundColor White
    Write-Host "tar --exclude='target' --exclude='venv' -czf openroberta.tar.gz ." -ForegroundColor White
    Write-Host "scp openroberta.tar.gz ubuntu@${serverIP}:/opt/openroberta/" -ForegroundColor White
    Write-Host "# Then on server:" -ForegroundColor White
    Write-Host "cd /opt/openroberta && tar -xzf openroberta.tar.gz" -ForegroundColor White
    Write-Host ""
    Write-Host "# 5. Build project" -ForegroundColor Green
    Write-Host "cd /opt/openroberta" -ForegroundColor White
    Write-Host "mvn clean install -DskipTests" -ForegroundColor White
    Write-Host "cd mj_pick_and_place" -ForegroundColor White
    Write-Host "python3 -m venv venv" -ForegroundColor White
    Write-Host "source venv/bin/activate" -ForegroundColor White
    Write-Host "pip install -r requirements.txt" -ForegroundColor White
    Write-Host "deactivate" -ForegroundColor White
    Write-Host ""
    Write-Host "# 6. Update CORS" -ForegroundColor Green
    Write-Host "nano /opt/openroberta/mj_pick_and_place/app.py" -ForegroundColor White
    Write-Host "# Change line to: cors = CORS(app, origins=['*'])" -ForegroundColor White
    Write-Host "# Save: Ctrl+X, Y, Enter" -ForegroundColor White
    Write-Host ""
    Write-Host "# 7. Install and start services" -ForegroundColor Green
    Write-Host "sudo cp /tmp/deploy/openroberta.service /etc/systemd/system/" -ForegroundColor White
    Write-Host "sudo cp /tmp/deploy/mujoco-api.service /etc/systemd/system/" -ForegroundColor White
    Write-Host "sudo systemctl daemon-reload" -ForegroundColor White
    Write-Host "sudo systemctl enable openroberta mujoco-api" -ForegroundColor White
    Write-Host "sudo systemctl start openroberta mujoco-api" -ForegroundColor White
    Write-Host ""
    Write-Host "# 8. Setup Nginx (optional - for port 80 access)" -ForegroundColor Green
    Write-Host "sudo cp /tmp/deploy/nginx-no-domain.conf /etc/nginx/sites-available/openroberta" -ForegroundColor White
    Write-Host "sudo ln -s /etc/nginx/sites-available/openroberta /etc/nginx/sites-enabled/" -ForegroundColor White
    Write-Host "sudo rm -f /etc/nginx/sites-enabled/default" -ForegroundColor White
    Write-Host "sudo nginx -t" -ForegroundColor White
    Write-Host "sudo systemctl restart nginx" -ForegroundColor White
    Write-Host ""
    Write-Host "# 9. Configure firewall" -ForegroundColor Green
    Write-Host "sudo ufw allow 22/tcp" -ForegroundColor White
    Write-Host "sudo ufw allow 80/tcp" -ForegroundColor White
    Write-Host "sudo ufw allow 1999/tcp" -ForegroundColor White
    Write-Host "sudo ufw allow 5000/tcp" -ForegroundColor White
    Write-Host "sudo ufw enable" -ForegroundColor White
    Write-Host ""
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Access Your Server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "With Nginx:" -ForegroundColor Yellow
Write-Host "  OpenRoberta: http://$serverIP" -ForegroundColor Green
Write-Host "  API: http://$serverIP/api/" -ForegroundColor Green
Write-Host ""
Write-Host "Without Nginx:" -ForegroundColor Yellow
Write-Host "  OpenRoberta: http://${serverIP}:1999" -ForegroundColor Green
Write-Host "  API: http://${serverIP}:5000" -ForegroundColor Green
Write-Host ""
Write-Host "Check status:" -ForegroundColor Yellow
Write-Host "  ssh ubuntu@$serverIP 'sudo systemctl status openroberta mujoco-api'" -ForegroundColor White
Write-Host ""
Write-Host "View logs:" -ForegroundColor Yellow
Write-Host "  ssh ubuntu@$serverIP 'sudo journalctl -u openroberta -f'" -ForegroundColor White
Write-Host ""

Read-Host "Press Enter to exit"
