# Getting Your Server IP - Step by Step

## You Need to Create a Cloud Server First!

Since you don't have a server yet, here's how to get one and find its IP address:

---

## EASIEST: Oracle Cloud (Always Free - No Credit Card in Some Regions)

### 1. Sign Up

- Go to: https://www.oracle.com/cloud/free/
- Click "Start for free"
- Create account (may or may not need credit card depending on region)

### 2. Create a VM Instance

1. After login, click "Create a VM instance"
2. **Name**: `openroberta-server`
3. **Image**: Ubuntu 22.04
4. **Shape**: VM.Standard.E2.1.Micro (Always Free eligible)
5. **Add SSH Keys**:
   - Download the private key (.key file)
   - Keep it safe!
6. Click "Create"

### 3. Find Your IP Address

- On the instance details page, look for **Public IP address**
- Example: `123.45.67.89`
- **Write it down!** ******\_\_\_******

### 4. Connect via SSH

```powershell
# In PowerShell (Windows)
ssh -i path\to\your\downloaded-key.key ubuntu@YOUR_IP_ADDRESS

# If permission error on Windows:
# Right-click key file → Properties → Security → Advanced
# Make sure only your user has access
```

---

## ALTERNATIVE: DigitalOcean ($200 Credit for 60 Days)

### 1. Sign Up

- Go to: https://www.digitalocean.com
- Use GitHub Student Pack or referral for $200 credit
- Credit card required but won't be charged during credit period

### 2. Create a Droplet

1. Click "Create" → "Droplets"
2. **Image**: Ubuntu 22.04 LTS
3. **Plan**: Basic - $10/month (cheapest option)
4. **Region**: Choose closest to you
5. **Authentication**: SSH Key (or Password)
   - Click "New SSH Key"
   - In PowerShell run: `ssh-keygen -t rsa -b 4096`
   - Copy contents of `~/.ssh/id_rsa.pub`
   - Paste into DigitalOcean
6. **Hostname**: `openroberta-server`
7. Click "Create Droplet"

### 3. Find Your IP Address

- After creation, you'll see the IP address on the droplet page
- Example: `123.45.67.89`
- **Write it down!** ******\_\_\_******

### 4. Connect via SSH

```powershell
ssh root@YOUR_IP_ADDRESS
# Or if you created as ubuntu user:
ssh ubuntu@YOUR_IP_ADDRESS
```

---

## ALTERNATIVE: AWS EC2 (Free for 12 Months)

### 1. Sign Up

- Go to: https://aws.amazon.com/free/
- Create account (credit card required but won't be charged)

### 2. Launch Instance

1. Go to EC2 Dashboard
2. Click "Launch Instance"
3. **Name**: `openroberta-server`
4. **AMI**: Ubuntu Server 22.04 LTS
5. **Instance type**: t2.small (t2.micro might be too small)
6. **Key pair**: Create new key pair
   - Download the .pem file
   - Keep it safe!
7. **Security Group**: Configure:
   - SSH (22) - Your IP
   - HTTP (80) - Anywhere
   - Custom TCP (1999) - Anywhere
   - Custom TCP (5000) - Anywhere
8. Click "Launch Instance"

### 3. Find Your IP Address

- Go to EC2 Dashboard → Instances
- Select your instance
- Look for **Public IPv4 address**
- Example: `123.45.67.89`
- **Write it down!** ******\_\_\_******

### 4. Connect via SSH

```powershell
# Fix permissions on the key file first
icacls path\to\your-key.pem /inheritance:r /grant:r "%username%:R"

# Connect
ssh -i path\to\your-key.pem ubuntu@YOUR_IP_ADDRESS
```

---

## After You Have Your Server IP

Once you have your server and can SSH into it, continue with:

### Next Steps:

1. Open `QUICK_START_NO_DOMAIN.md`
2. Replace `YOUR_SERVER_IP` with your actual IP address
3. Follow the commands step by step

---

## Testing Your Connection

Before proceeding, make sure you can connect:

```powershell
# Test SSH connection
ssh ubuntu@YOUR_SERVER_IP

# If connected successfully, you'll see:
# ubuntu@openroberta-server:~$

# Test if you can become root:
sudo whoami
# Should output: root

# Exit:
exit
```

---

## What's Your Server IP?

Find out by running this command on your server after SSH:

```bash
curl -4 ifconfig.me
```

Or check your cloud provider's dashboard.

**Your IP Address: ******\_\_\_********

Write it down and use it in all the commands where you see `YOUR_SERVER_IP`!

---

## Need Help?

**Can't SSH?**

- Check security group/firewall allows port 22
- Verify you're using the correct key file
- Try: `ssh -v ubuntu@YOUR_IP` for verbose output

**Don't want to pay?**

- Use Oracle Cloud Always Free tier
- Use AWS Free tier (12 months)
- Use student credits from GitHub Education Pack

**Which should I choose?**

- **Easiest**: DigitalOcean (simple interface)
- **Free forever**: Oracle Cloud
- **Most popular**: AWS EC2
