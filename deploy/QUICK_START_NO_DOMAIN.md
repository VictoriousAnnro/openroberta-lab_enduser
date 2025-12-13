# Quick Deployment Without Domain

Fast deployment checklist using only IP address - no domain required!

## ☑️ What You Need (15 minutes setup)

- [ ] Cloud server (AWS/DigitalOcean/Oracle/etc.)
- [ ] Server IP address: `_______________`
- [ ] SSH access confirmed

## ☑️ Server Setup (30 minutes)

```bash
# 1. SSH into server
ssh ubuntu@YOUR_SERVER_IP

# 2. Download and run deployment script
wget https://raw.githubusercontent.com/VictoriousAnnro/openroberta-lab_enduser/main/deploy/deploy-no-domain.sh
chmod +x deploy-no-domain.sh
./deploy-no-domain.sh

# 3. Upload your project (choose one method)

# METHOD A: Git clone
cd /opt/openroberta
git clone YOUR_REPO_URL .

# METHOD B: From your local machine
# Create tar: tar --exclude='target' --exclude='venv' -czf openroberta.tar.gz .
# Upload: scp openroberta.tar.gz ubuntu@YOUR_SERVER_IP:/opt/openroberta/
# Extract on server: cd /opt/openroberta && tar -xzf openroberta.tar.gz

# 4. Build project
cd /opt/openroberta
mvn clean install -DskipTests

# 5. Setup Python environment
cd mj_pick_and_place
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate

# 6. Update CORS in app.py
cd /opt/openroberta/mj_pick_and_place
nano app.py
# Change: cors = CORS(app, origins=["*"])
# Save: Ctrl+X, Y, Enter
```

## ☑️ Start Services (10 minutes)

```bash
# 7. Install and start services
cd /opt/openroberta
sudo cp deploy/openroberta.service /etc/systemd/system/
sudo cp deploy/mujoco-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable openroberta mujoco-api
sudo systemctl start openroberta mujoco-api

# 8. (Optional) Install Nginx for port 80 access
sudo cp deploy/nginx-no-domain.conf /etc/nginx/sites-available/openroberta
sudo ln -s /etc/nginx/sites-available/openroberta /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## ☑️ Configure Firewall (5 minutes)

```bash
# 9. Allow necessary ports
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP (if using Nginx)
sudo ufw allow 1999/tcp # OpenRoberta (if not using Nginx)
sudo ufw allow 5000/tcp # API (if not using Nginx)
sudo ufw enable
sudo ufw status
```

## ☑️ Testing (5 minutes)

**With Nginx (recommended):**

- [ ] Visit `http://YOUR_SERVER_IP`
- [ ] OpenRoberta interface loads
- [ ] Test API: `http://YOUR_SERVER_IP/api/restart_scene`

**Without Nginx:**

- [ ] Visit `http://YOUR_SERVER_IP:1999`
- [ ] OpenRoberta interface loads
- [ ] Test API: `http://YOUR_SERVER_IP:5000/restart_scene`

## 🎉 Done!

**Your URLs:**

- OpenRoberta: `http://YOUR_SERVER_IP` or `http://YOUR_SERVER_IP:1999`
- MuJoCo API: `http://YOUR_SERVER_IP/api/` or `http://YOUR_SERVER_IP:5000`

---

## Quick Commands

**View logs:**

```bash
sudo journalctl -u openroberta -f
sudo journalctl -u mujoco-api -f
```

**Restart:**

```bash
sudo systemctl restart openroberta mujoco-api nginx
```

**Check status:**

```bash
sudo systemctl status openroberta mujoco-api
```

**Update code:**

```bash
cd /opt/openroberta && git pull
mvn clean install -DskipTests
sudo systemctl restart openroberta mujoco-api
```

---

## Troubleshooting

**Can't connect?**

```bash
# Check firewall
sudo ufw status

# Check services
sudo systemctl status openroberta mujoco-api

# Check ports
sudo netstat -tlnp | grep -E '1999|5000|80'
```

**Service failed?**

```bash
sudo journalctl -u openroberta -n 50 --no-pager
sudo journalctl -u mujoco-api -n 50 --no-pager
```

**Out of memory?**

```bash
# Increase swap
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

## Cloud Provider Quick Start

**AWS EC2:**

1. Launch Ubuntu 22.04 t2.small
2. Security Group: Allow ports 22, 80, 1999, 5000
3. Use provided SSH key

**DigitalOcean:**

1. Create Droplet - Ubuntu 22.04
2. Basic plan - $10/month
3. Enable SSH keys

**Oracle Cloud (Free):**

1. Create VM - Ubuntu 22.04
2. Shape: VM.Standard.E2.1.Micro (Always Free)
3. Add ingress rules for ports

---

Total time: ~1 hour from start to finish! 🚀
