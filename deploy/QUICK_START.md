# Quick Start Deployment Checklist

Use this checklist to quickly deploy OpenRoberta Lab with Cloudflare.

## ☑️ Pre-Deployment Checklist

- [ ] Cloud server created (Ubuntu 20.04/22.04)
- [ ] Domain added to Cloudflare account
- [ ] SSH access to server confirmed
- [ ] Server IP address noted: `_______________`
- [ ] Domain name noted: `_______________`

## ☑️ Server Setup (30-45 minutes)

```bash
# 1. SSH into server
ssh ubuntu@YOUR_SERVER_IP

# 2. Upload and run deployment script
# (From local machine)
scp deploy/deploy.sh ubuntu@YOUR_SERVER_IP:/tmp/
ssh ubuntu@YOUR_SERVER_IP
chmod +x /tmp/deploy.sh
/tmp/deploy.sh

# 3. Upload your project code
cd /opt/openroberta
# Option A: git clone YOUR_REPO_URL .
# Option B: Upload via SCP/SFTP

# 4. Build project
mvn clean install -DskipTests
cd mj_pick_and_place
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate

# 5. Update CORS in app.py
nano mj_pick_and_place/app.py
# Change: cors = CORS(app, origins=["https://YOUR_DOMAIN.com"])
```

## ☑️ Service Configuration (10-15 minutes)

```bash
# 6. Install systemd services
sudo cp /tmp/deploy/openroberta.service /etc/systemd/system/
sudo cp /tmp/deploy/mujoco-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable openroberta mujoco-api
sudo systemctl start openroberta mujoco-api

# 7. Configure Nginx
sudo cp /tmp/deploy/nginx-openroberta.conf /etc/nginx/sites-available/openroberta
sudo nano /etc/nginx/sites-available/openroberta
# Replace 'yourdomain.com' with your actual domain
sudo ln -s /etc/nginx/sites-available/openroberta /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## ☑️ Cloudflare Setup (5-10 minutes)

```
8. Cloudflare DNS:
   - Go to DNS settings
   - Add A record: openroberta → YOUR_SERVER_IP (Proxied ✅)
   - Add A record: api → YOUR_SERVER_IP (Proxied ✅)

9. Cloudflare SSL/TLS:
   - Set encryption mode: Full
   - Enable: Always Use HTTPS
   - Enable: Automatic HTTPS Rewrites
```

## ☑️ SSL Certificates (5 minutes)

```bash
# 10. Install SSL certificates
sudo certbot --nginx -d openroberta.YOUR_DOMAIN.com -d api.YOUR_DOMAIN.com
# Follow prompts and choose option 2 (redirect HTTP to HTTPS)
```

## ☑️ Firewall (2 minutes)

```bash
# 11. Configure firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## ☑️ Testing (5 minutes)

- [ ] Visit `https://openroberta.YOUR_DOMAIN.com`
- [ ] OpenRoberta Lab interface loads
- [ ] Create and run a test program
- [ ] API calls to MuJoCo work
- [ ] Check logs: `sudo journalctl -u openroberta -f`

## 🎉 Deployment Complete!

Your OpenRoberta Lab is now live at: `https://openroberta.YOUR_DOMAIN.com`

---

## Quick Commands Reference

**View logs:**

```bash
sudo journalctl -u openroberta -f
sudo journalctl -u mujoco-api -f
```

**Restart services:**

```bash
sudo systemctl restart openroberta mujoco-api nginx
```

**Update code:**

```bash
cd /opt/openroberta && git pull
mvn clean install -DskipTests
sudo systemctl restart openroberta mujoco-api
```

**Check service status:**

```bash
sudo systemctl status openroberta
sudo systemctl status mujoco-api
sudo systemctl status nginx
```
