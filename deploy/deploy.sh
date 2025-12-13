#!/bin/bash

# OpenRoberta Lab Deployment Script
# This script sets up the OpenRoberta Lab server and MuJoCo API on a fresh Ubuntu server

set -e

echo "=========================================="
echo "OpenRoberta Lab Deployment Script"
echo "=========================================="

# Update system
echo "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Java 11
echo "Installing Java 11..."
sudo apt-get install -y openjdk-11-jdk

# Install Maven
echo "Installing Maven..."
sudo apt-get install -y maven

# Install Git
echo "Installing Git..."
sudo apt-get install -y git

# Install Python and dependencies
echo "Installing Python 3 and pip..."
sudo apt-get install -y python3 python3-pip python3-venv

# Install Nginx
echo "Installing Nginx..."
sudo apt-get install -y nginx

# Create deployment directory
echo "Setting up deployment directory..."
sudo mkdir -p /opt/openroberta
sudo chown $USER:$USER /opt/openroberta

# Clone repository (update with your actual repo URL)
echo "Cloning repository..."
cd /opt/openroberta
# git clone https://github.com/VictoriousAnnro/openroberta-lab_enduser.git .
# For now, you'll need to manually upload your code or set up git credentials

echo "Building OpenRoberta Lab..."
cd /opt/openroberta
mvn clean install -DskipTests

# Set up Python virtual environment
echo "Setting up Python virtual environment..."
cd /opt/openroberta/mj_pick_and_place
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate

# Install Certbot for SSL
echo "Installing Certbot..."
sudo apt-get install -y certbot python3-certbot-nginx

echo "=========================================="
echo "Deployment setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Copy systemd service files to /etc/systemd/system/"
echo "2. Copy nginx configuration to /etc/nginx/sites-available/"
echo "3. Enable and start services"
echo "4. Configure Cloudflare DNS"
echo "5. Run certbot for SSL certificates"
echo ""
echo "See deployment guide for details."
