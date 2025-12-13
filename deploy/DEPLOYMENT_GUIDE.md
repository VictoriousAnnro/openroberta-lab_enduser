# OpenRoberta Lab - Cloud Deployment Guide with Cloudflare

This guide will walk you through deploying OpenRoberta Lab to a cloud server with Cloudflare as the reverse proxy.

## Prerequisites

- A cloud server (Ubuntu 20.04/22.04 recommended)
  - Minimum: 2 CPU cores, 4GB RAM, 20GB storage
  - Recommended: 4 CPU cores, 8GB RAM, 50GB storage
- A domain name added to Cloudflare
- SSH access to your server
- Basic Linux command line knowledge

## Step 1: Prepare Your Cloud Server

### Choose a Cloud Provider

- **AWS EC2**: Launch an Ubuntu instance
- **DigitalOcean**: Create a Droplet with Ubuntu
- **Azure**: Create a Virtual Machine
- **Google Cloud**: Create a Compute Engine instance
- **Linode**, **Vultr**, etc.

### Initial Server Setup

```bash
# SSH into your server
ssh ubuntu@your-server-ip

# Update the system
sudo apt-get update && sudo apt-get upgrade -y

# Create a swap file (if RAM is limited)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## Step 2: Upload Deployment Files

From your local machine, upload the deployment files:

```powershell
# Using SCP to upload files
scp -r deploy ubuntu@your-server-ip:/tmp/

# Or use SFTP client like FileZilla, WinSCP
```

## Step 3: Run Deployment Script

```bash
# On the server
cd /tmp/deploy
chmod +x deploy.sh
./deploy.sh
```

## Step 4: Upload Your Project Code

### Option A: Git Clone (Recommended)

```bash
cd /opt/openroberta

# If your repo is private, set up SSH keys or use HTTPS with token
git clone https://github.com/VictoriousAnnro/openroberta-lab_enduser.git .

# Or if already cloned, pull latest changes
git pull origin final_version_EndUserSemesterProject
```

### Option B: Manual Upload

```powershell
# From your local machine
# Compress the project (excluding large folders)
tar -czf openroberta-project.tar.gz --exclude=node_modules --exclude=target --exclude=venv .

# Upload to server
scp openroberta-project.tar.gz ubuntu@your-server-ip:/opt/openroberta/

# On server
cd /opt/openroberta
tar -xzf openroberta-project.tar.gz
```

## Step 5: Build the Project

```bash
cd /opt/openroberta

# Build OpenRoberta Lab
mvn clean install -DskipTests

# Set up Python virtual environment
cd mj_pick_and_place
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
```

## Step 6: Update CORS Configuration

Edit the Flask app to allow your domain:

```bash
nano /opt/openroberta/mj_pick_and_place/app.py
```

Update the CORS configuration:

```python
cors = CORS(app, origins=[
    "http://localhost:1999",
    "https://openroberta.yourdomain.com"  # Add your domain
])
```

## Step 7: Install Systemd Services

```bash
# Copy service files
sudo cp /tmp/deploy/openroberta.service /etc/systemd/system/
sudo cp /tmp/deploy/mujoco-api.service /etc/systemd/system/

# Update the username in service files if not using 'ubuntu'
# sudo nano /etc/systemd/system/openroberta.service
# sudo nano /etc/systemd/system/mujoco-api.service

# Reload systemd
sudo systemctl daemon-reload

# Enable services to start on boot
sudo systemctl enable openroberta
sudo systemctl enable mujoco-api

# Start services
sudo systemctl start openroberta
sudo systemctl start mujoco-api

# Check status
sudo systemctl status openroberta
sudo systemctl status mujoco-api
```

## Step 8: Configure Nginx

```bash
# Copy nginx configuration
sudo cp /tmp/deploy/nginx-openroberta.conf /etc/nginx/sites-available/openroberta

# Edit the file and replace 'yourdomain.com' with your actual domain
sudo nano /etc/nginx/sites-available/openroberta

# Create symbolic link
sudo ln -s /etc/nginx/sites-available/openroberta /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
```

## Step 9: Configure Cloudflare DNS

1. Log into your Cloudflare account
2. Select your domain
3. Go to **DNS** settings
4. Add A records:

   - **Name**: `openroberta` (or subdomain of choice)
   - **IPv4 address**: Your server's IP
   - **Proxy status**: ✅ Proxied (orange cloud)

   - **Name**: `api` (or subdomain of choice)
   - **IPv4 address**: Your server's IP
   - **Proxy status**: ✅ Proxied (orange cloud)

## Step 10: Configure Cloudflare SSL/TLS

1. In Cloudflare dashboard, go to **SSL/TLS** → **Overview**
2. Set encryption mode to **Full** (or **Full (strict)** if using origin certificates)
3. Go to **Edge Certificates**
4. Enable:
   - ✅ Always Use HTTPS
   - ✅ Automatic HTTPS Rewrites
   - ✅ Minimum TLS Version: 1.2

## Step 11: Set Up SSL Certificates with Let's Encrypt

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Obtain SSL certificates
sudo certbot --nginx -d openroberta.yourdomain.com -d api.yourdomain.com

# Follow the prompts:
# - Enter your email
# - Agree to terms
# - Choose to redirect HTTP to HTTPS (option 2)

# Test auto-renewal
sudo certbot renew --dry-run
```

## Step 12: Configure Firewall

```bash
# Enable UFW firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Check status
sudo ufw status
```

## Step 13: Test Your Deployment

1. Visit `https://openroberta.yourdomain.com` - should show OpenRoberta Lab
2. Visit `https://api.yourdomain.com` - should show Flask API or test endpoint
3. Test functionality:
   - Create a program in OpenRoberta
   - Test API calls to MuJoCo

## Monitoring and Maintenance

### View Logs

```bash
# OpenRoberta logs
sudo journalctl -u openroberta -f

# MuJoCo API logs
sudo journalctl -u mujoco-api -f

# Nginx logs
sudo tail -f /var/log/nginx/openroberta-access.log
sudo tail -f /var/log/nginx/openroberta-error.log
```

### Restart Services

```bash
# Restart individual services
sudo systemctl restart openroberta
sudo systemctl restart mujoco-api
sudo systemctl restart nginx

# Restart all
sudo systemctl restart openroberta mujoco-api nginx
```

### Update Code

```bash
# Pull latest changes
cd /opt/openroberta
git pull

# Rebuild
mvn clean install -DskipTests

# Restart services
sudo systemctl restart openroberta mujoco-api
```

## Cloudflare Performance Optimization

### 1. Enable Caching

In Cloudflare dashboard:

- **Caching** → **Configuration**
- Caching Level: **Standard**
- Browser Cache TTL: **4 hours**

### 2. Enable Compression

- **Speed** → **Optimization**
- Enable **Auto Minify** (JavaScript, CSS, HTML)
- Enable **Brotli** compression

### 3. Enable Argo Smart Routing (Optional - Paid)

For improved performance globally.

## Troubleshooting

### Service won't start

```bash
# Check service status
sudo systemctl status openroberta
sudo systemctl status mujoco-api

# View detailed logs
sudo journalctl -u openroberta -n 100 --no-pager
sudo journalctl -u mujoco-api -n 100 --no-pager
```

### Port already in use

```bash
# Check what's using the port
sudo lsof -i :1999
sudo lsof -i :5000

# Kill the process if needed
sudo kill -9 <PID>
```

### CORS errors

- Verify `app.py` has correct origin domain
- Check Nginx CORS headers
- Verify Cloudflare SSL/TLS settings

### 502 Bad Gateway

- Services may not be running: `sudo systemctl start openroberta mujoco-api`
- Check if ports 1999 and 5000 are listening: `sudo netstat -tlnp | grep -E '1999|5000'`

## Security Best Practices

1. **Keep system updated**:

   ```bash
   sudo apt-get update && sudo apt-get upgrade -y
   ```

2. **Set up automatic security updates**:

   ```bash
   sudo apt-get install unattended-upgrades
   sudo dpkg-reconfigure --priority=low unattended-upgrades
   ```

3. **Configure Cloudflare Firewall Rules**:

   - Block malicious traffic
   - Rate limiting
   - Challenge suspicious requests

4. **Regular backups**:
   ```bash
   # Backup database and configurations
   tar -czf backup-$(date +%Y%m%d).tar.gz /opt/openroberta/OpenRobertaServer/db-embedded
   ```

## Cost Considerations

- **Server**: $5-20/month (DigitalOcean, Linode, Vultr)
- **Cloudflare**: Free plan sufficient for most use cases
- **Domain**: $10-15/year

## Need Help?

- Check logs first: `sudo journalctl -u openroberta -f`
- Review Nginx error logs: `sudo tail -f /var/log/nginx/openroberta-error.log`
- Test connectivity: `curl -I http://localhost:1999`

---

**Your OpenRoberta Lab is now deployed and protected by Cloudflare!** 🎉
