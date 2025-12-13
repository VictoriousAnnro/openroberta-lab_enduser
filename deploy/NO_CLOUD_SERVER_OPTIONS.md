# Run OpenRoberta WITHOUT a Cloud Server

Don't want to create a cloud server? No problem! Here are your options:

---

## Option 1: Run Locally on Your Windows Machine (EASIEST)

You already have everything you need! Run it directly on your computer.

### Setup (5 minutes):

**Terminal 1 - Start OpenRoberta Lab:**

```bash
# In WSL or Git Bash
cd /mnt/c/Users/jimda/Desktop/openRoberta1/openroberta-lab_enduser
./ora.sh start-from-git
```

**Terminal 2 - Start MuJoCo API:**

```bash
# In WSL or Git Bash
cd /mnt/c/Users/jimda/Desktop/openRoberta1/openroberta-lab_enduser/mj_pick_and_place
source venv/bin/activate
flask --app app.py run
```

### Access:

- OpenRoberta: `http://localhost:1999`
- API: `http://localhost:5000`

### Share with Others on Same Network:

```bash
# Find your local IP
ipconfig  # Look for IPv4 Address (e.g., 192.168.1.100)

# Others can access:
# http://192.168.1.100:1999
```

**Pros:**

- ✅ Free
- ✅ No setup needed
- ✅ Already working on your machine
- ✅ Instant

**Cons:**

- ❌ Only accessible from your computer (or local network)
- ❌ Computer must stay on
- ❌ Not accessible from internet

---

## Option 2: Cloudflare Tunnel (FREE - Internet Access)

Make your localhost accessible from anywhere on the internet without a server!

### Setup (10 minutes):

**1. Install Cloudflared:**

```powershell
# Windows
winget install --id Cloudflare.cloudflared
```

**2. Start Your Local Servers:**

```bash
# Terminal 1: OpenRoberta
cd /mnt/c/Users/jimda/Desktop/openRoberta1/openroberta-lab_enduser
./ora.sh start-from-git

# Terminal 2: MuJoCo API
cd mj_pick_and_place
source venv/bin/activate
flask --app app.py run
```

**3. Create Tunnel:**

```powershell
# Terminal 3: Expose OpenRoberta
cloudflared tunnel --url http://localhost:1999

# You'll get a URL like: https://random-name.trycloudflare.com
# Share this URL with anyone!
```

**Optional - For API:**

```powershell
# Terminal 4: Expose API
cloudflared tunnel --url http://localhost:5000
```

### Update CORS for Cloudflare URL:

```python
# In app.py
cors = CORS(app, origins=[
    "http://localhost:1999",
    "https://your-random-name.trycloudflare.com"  # Add your tunnel URL
])
```

**Pros:**

- ✅ Free
- ✅ Internet accessible
- ✅ HTTPS included
- ✅ No cloud server needed
- ✅ Share via URL

**Cons:**

- ❌ Random URL changes each time
- ❌ Computer must stay on
- ❌ Tunnel disconnects if you close terminal

---

## Option 3: ngrok (Alternative to Cloudflare Tunnel)

Similar to Cloudflare Tunnel but with persistent URLs on paid plan.

### Setup:

**1. Install ngrok:**

- Download from: https://ngrok.com/download
- Sign up for free account
- Get auth token

**2. Setup:**

```powershell
# Authenticate
ngrok config add-authtoken YOUR_AUTH_TOKEN

# Start servers (like Option 1)

# Expose OpenRoberta
ngrok http 1999

# You'll get: https://abc123.ngrok.io
```

**Free tier:** Random URLs, 40 connections/minute
**Paid ($8/month):** Custom domains, more connections

---

## Option 4: Windows Subsystem for Linux + Port Forwarding

Run like a mini-server on your Windows machine.

### Setup:

**1. Enable WSL2** (if not already):

```powershell
wsl --install
wsl --set-default-version 2
```

**2. Install Ubuntu in WSL:**

```powershell
wsl --install -d Ubuntu-22.04
```

**3. Setup in WSL:**

```bash
# In WSL
cd /mnt/c/Users/jimda/Desktop/openRoberta1/openroberta-lab_enduser

# Install dependencies (if needed)
sudo apt update
sudo apt install openjdk-11-jdk maven python3 python3-pip

# Run servers
./ora.sh start-from-git
# In another terminal:
cd mj_pick_and_place
python3 -m venv venv
source venv/bin/activate
flask --app app.py run --host=0.0.0.0
```

**4. Access from Windows:**

```
http://localhost:1999
```

**5. Access from other devices on network:**

```
# Find Windows IP: ipconfig
http://YOUR_WINDOWS_IP:1999
```

---

## Option 5: Docker Desktop (Containerized)

Run in isolated containers on your Windows machine.

### Setup:

**1. Install Docker Desktop:**

- Download: https://www.docker.com/products/docker-desktop/

**2. Build and Run:**

```powershell
cd C:\Users\jimda\Desktop\openRoberta1\openroberta-lab_enduser

# Build Docker image
docker build -f Resources\dockerStandalone\Dockerfile -t openroberta-lab .

# Run container
docker run -p 1999:1999 openroberta-lab

# Access at: http://localhost:1999
```

**Pros:**

- ✅ Isolated environment
- ✅ Easy to start/stop
- ✅ Portable

**Cons:**

- ❌ Requires Docker Desktop
- ❌ Uses system resources
- ❌ Still only local unless combined with tunnel

---

## Option 6: Use GitHub Codespaces (Cloud-based, Free Hours)

Run in a cloud development environment.

### Setup:

**1. Push your code to GitHub**

**2. Create Codespace:**

- Go to your GitHub repo
- Click "Code" → "Codespaces" → "Create codespace"

**3. In Codespace terminal:**

```bash
mvn clean install -DskipTests
./ora.sh start-from-git
```

**4. Forward ports:**

- Codespaces will auto-detect ports 1999 and 5000
- Click "Ports" tab → Make public
- Access via provided URL

**Free tier:** 60 hours/month

---

## Comparison Table

| Option                | Cost      | Internet Access | Setup Time | Computer Must Stay On |
| --------------------- | --------- | --------------- | ---------- | --------------------- |
| **Local Only**        | Free      | ❌ No           | 5 min      | Yes                   |
| **Cloudflare Tunnel** | Free      | ✅ Yes          | 10 min     | Yes                   |
| **ngrok**             | Free/$8   | ✅ Yes          | 10 min     | Yes                   |
| **WSL**               | Free      | Network only    | 15 min     | Yes                   |
| **Docker**            | Free      | ❌ No           | 15 min     | Yes                   |
| **GitHub Codespaces** | Free/Paid | ✅ Yes          | 10 min     | No (cloud)            |
| **Cloud Server**      | $5-20/mo  | ✅ Yes          | 60 min     | No (always on)        |

---

## Recommendations

**For Testing/Development:**
→ **Option 1** (Run Locally) - Fastest and simplest

**For Sharing with Friends:**
→ **Option 2** (Cloudflare Tunnel) - Free and gets you online instantly

**For Demo/Presentation:**
→ **Option 2** (Cloudflare Tunnel) or **Option 3** (ngrok)

**For Portfolio/Long-term:**
→ **Cloud Server** (from previous guide) - Professional, always online

**For Learning Docker:**
→ **Option 5** (Docker Desktop)

---

## Quick Start Commands

### Just want to run it NOW?

**1. Open PowerShell or Git Bash**

**2. Start OpenRoberta:**

```bash
cd C:\Users\jimda\Desktop\openRoberta1\openroberta-lab_enduser
.\ora.sh start-from-git
```

**3. In NEW terminal, start API:**

```bash
cd C:\Users\jimda\Desktop\openRoberta1\openroberta-lab_enduser\mj_pick_and_place
.\venv\Scripts\activate  # Windows
flask --app app.py run
```

**4. Open browser:**

```
http://localhost:1999
```

**Done!** 🎉

---

## Need Internet Access Right Now?

**Fastest way (2 minutes):**

```powershell
# Install cloudflared
winget install --id Cloudflare.cloudflared

# Start your servers (as above)

# In new terminal:
cloudflared tunnel --url http://localhost:1999

# Share the URL it gives you!
```

That's it! No cloud server, no domain, no credit card required!

---

## Which option do you want?

Let me know and I can give you the exact commands to run!
