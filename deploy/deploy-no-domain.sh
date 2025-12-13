#!/bin/bash

# OpenRoberta Lab Deployment Script (IP-based, no domain required)
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

echo "=========================================="
echo "Deployment setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Upload your project code to /opt/openroberta"
echo "2. Build the project with: mvn clean install -DskipTests"
echo "3. Copy systemd service files to /etc/systemd/system/"
echo "4. Copy nginx configuration to /etc/nginx/sites-available/"
echo "5. Enable and start services"
echo ""
echo "Your server will be accessible at: http://YOUR_SERVER_IP:1999"
echo ""
