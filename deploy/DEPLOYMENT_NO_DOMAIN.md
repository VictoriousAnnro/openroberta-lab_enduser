# OpenRoberta Lab - Cloud Deployment WITHOUT Domain

Deploy OpenRoberta Lab using only your server's IP address. No domain name or Cloudflare required!

## Prerequisites

- A cloud server (Ubuntu 20.04/22.04)
  - Minimum: 2 CPU cores, 4GB RAM, 20GB storage
- SSH access to your server
- Your server's public IP address

## Step 1: Get a Cloud Server

### Free/Cheap Options:

**AWS Free Tier (12 months free):**

- Go to aws.amazon.com
- Create account → Launch EC2 instance
- Choose Ubuntu 22.04 LTS
- Instance type: t2.small or t2.medium
- Configure security group (see Step 2)

**DigitalOcean ($200 credit for 60 days):**

- Go to digitalocean.com
- Create Droplet → Ubuntu 22.04
- Choose: Basic plan, $10-12/month
- Select region closest to you

**Other options:**

- **Oracle Cloud**: Always free tier (limited resources)
- **Google Cloud**: $300 credit for 90 days
- **Azure**: $200 credit for 30 days
- **Linode**: $100 credit for 60 days

## Step 2: Configure Firewall/Security Group

Before deployment, allow these ports:

**AWS Security Group:**

```
Type: SSH, Port: 22, Source: Your IP
Type: HTTP, Port: 80, Source: 0.0.0.0/0
Type: Custom TCP, Port: 1999, Source: 0.0.0.0/0
Type: Custom TCP, Port: 5000, Source: 0.0.0.0/0
```

**DigitalOcean Firewall:**

```
SSH: Port 22 from All sources
HTTP: Port 80 from All sources
Custom: Port 1999 from All sources
Custom: Port 5000 from All sources
```

**Using UFW (on server):**

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 1999/tcp
sudo ufw allow 5000/tcp
sudo ufw enable
```

## Step 3: Initial Server Setup

```bash
# SSH into your server
ssh ubuntu@YOUR_SERVER_IP

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Create swap file (if server has < 4GB RAM)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## Step 4: Upload and Run Deployment Script

**From your local machine (PowerShell):**

```powershell
cd C:\Users\jimda\Desktop\openRoberta1\openroberta-lab_enduser
scp deploy/deploy-no-domain.sh ubuntu@YOUR_SERVER_IP:/tmp/
```

**On the server:**

```bash
chmod +x /tmp/deploy-no-domain.sh
/tmp/deploy-no-domain.sh
```

## Step 5: Upload Your Project

**Option A: Using Git (if repo is public)**

```bash
cd /opt/openroberta
git clone https://github.com/VictoriousAnnro/openroberta-lab_enduser.git .
```

**Option B: Upload via SCP (from local machine)**

```powershell
# Create archive (excluding large folders)
# In WSL/Git Bash:
cd /mnt/c/Users/jimda/Desktop/openRoberta1/openroberta-lab_enduser
tar --exclude='target' --exclude='venv' --exclude='node_modules' --exclude='.git' -czf openroberta.tar.gz .

# Upload to server
scp openroberta.tar.gz ubuntu@YOUR_SERVER_IP:/opt/openroberta/

# On server, extract:
cd /opt/openroberta
tar -xzf openroberta.tar.gz
rm openroberta.tar.gz
```

**Option C: Use WinSCP or FileZilla (GUI)**

- Download WinSCP: https://winscp.net/
- Connect to YOUR_SERVER_IP with username: ubuntu
- Upload entire project to `/opt/openroberta/`

## Step 6: Build the Project

```bash
cd /opt/openroberta

# Build OpenRoberta Lab
mvn clean install -DskipTests

# This takes 5-10 minutes
# If build fails due to memory, increase swap size

# Set up Python virtual environment
cd mj_pick_and_place
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
```

## Step 7: Update CORS Configuration

```bash
nano /opt/openroberta/mj_pick_and_place/app.py
```

Update the CORS line to allow all origins (since we're using IP):

```python
# Change from:
cors = CORS(app, origins=["http://localhost:1999"])

# To:
cors = CORS(app, origins=["*"])
# Or be more specific:
cors = CORS(app, origins=["http://YOUR_SERVER_IP", "http://YOUR_SERVER_IP:1999"])
```

Save and exit (Ctrl+X, Y, Enter)

## Step 8: Install Systemd Services

```bash
# Copy service files
cd /opt/openroberta
sudo cp deploy/openroberta.service /etc/systemd/system/
sudo cp deploy/mujoco-api.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable services to start on boot
sudo systemctl enable openroberta
sudo systemctl enable mujoco-api

# Start services
sudo systemctl start openroberta
sudo systemctl start mujoco-api

# Check status (wait 30 seconds for services to start)
sleep 30
sudo systemctl status openroberta
sudo systemctl status mujoco-api
```

## Step 9: Configure Nginx (Optional - for port 80 access)

**Without Nginx:** Access via `http://YOUR_SERVER_IP:1999`

**With Nginx:** Access via `http://YOUR_SERVER_IP` (port 80)

```bash
# Copy nginx configuration
sudo cp /opt/openroberta/deploy/nginx-no-domain.conf /etc/nginx/sites-available/openroberta

# Create symbolic link
sudo ln -s /etc/nginx/sites-available/openroberta /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
```

## Step 10: Test Your Deployment

### Test OpenRoberta Lab:

- **With Nginx**: Visit `http://YOUR_SERVER_IP`
- **Without Nginx**: Visit `http://YOUR_SERVER_IP:1999`

### Test MuJoCo API:

- **With Nginx**: Visit `http://YOUR_SERVER_IP/api/restart_scene`
- **Without Nginx**: Visit `http://YOUR_SERVER_IP:5000/restart_scene`

### Create a test program:

1. Go to OpenRoberta interface
2. Create a new program
3. Add NAO blocks
4. Run simulation

## Access URLs Summary

**Option 1: Direct access (no Nginx)**

- OpenRoberta: `http://YOUR_SERVER_IP:1999`
- API: `http://YOUR_SERVER_IP:5000`

**Option 2: With Nginx (recommended)**

- OpenRoberta: `http://YOUR_SERVER_IP`
- API: `http://YOUR_SERVER_IP/api/`

## Monitoring and Logs

```bash
# View OpenRoberta logs
sudo journalctl -u openroberta -f

# View API logs
sudo journalctl -u mujoco-api -f

# View all logs
sudo journalctl -u openroberta -u mujoco-api -f

# Check service status
sudo systemctl status openroberta mujoco-api nginx
```

## Restart Services

```bash
# Restart all services
sudo systemctl restart openroberta mujoco-api nginx

# Restart just one
sudo systemctl restart openroberta
```

## Update Your Code

```bash
cd /opt/openroberta

# Pull latest changes (if using git)
git pull

# Rebuild
mvn clean install -DskipTests

# Rebuild Python environment if requirements changed
cd mj_pick_and_place
source venv/bin/activate
pip install -r requirements.txt
deactivate

# Restart services
sudo systemctl restart openroberta mujoco-api
```

## Troubleshooting

### Services won't start

```bash
# Check detailed logs
sudo journalctl -u openroberta -n 100 --no-pager
sudo journalctl -u mujoco-api -n 100 --no-pager

# Check if Java is working
java -version

# Check if ports are in use
sudo lsof -i :1999
sudo lsof -i :5000
```

### Can't connect from browser

```bash
# Check firewall
sudo ufw status

# Check if services are running
sudo systemctl status openroberta mujoco-api

# Check if ports are listening
sudo netstat -tlnp | grep -E '1999|5000|80'

# Test locally from server
curl http://localhost:1999
curl http://localhost:5000
```

### Out of memory during build

```bash
# Increase swap space
sudo swapoff /swapfile
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Try building again
cd /opt/openroberta
mvn clean install -DskipTests
```

### Port 80 requires sudo

If you don't want to use Nginx and want direct access, use port 1999 (doesn't require sudo).

## Cost Estimate

**Monthly costs (approximate):**

- AWS t2.small: ~$16-20/month (free tier: $0 for 12 months)
- DigitalOcean Basic: $10-12/month
- Oracle Always Free: $0
- Linode Nanode: $5/month (limited resources)

**One-time costs:**

- None! No domain required
- No SSL certificate fees
- No Cloudflare subscription

## Security Notes (Important!)

⚠️ **Without HTTPS, your connection is not encrypted!**

For production use, consider:

1. Using a free domain from providers like Freenom
2. Setting up Let's Encrypt SSL (requires domain)
3. Using Cloudflare Tunnel (free, provides HTTPS)

For development/testing/educational use, HTTP is fine.

## Need to add HTTPS without a domain?

Use **Cloudflare Tunnel** (Option 1 from original guide):

- Provides free HTTPS
- No domain required (uses trycloudflare.com subdomain)
- Run: `cloudflared tunnel --url http://localhost:1999`

## Share Your Server

To share with others, just give them your IP address:

- `http://YOUR_SERVER_IP` (if using Nginx)
- `http://YOUR_SERVER_IP:1999` (if not using Nginx)

---

**You're done! OpenRoberta Lab is now accessible at your server's IP address!** 🎉
