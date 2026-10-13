#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu LTS Droplet. Run as root, on the server:
#   ssh root@<host> 'bash -s' < deploy/server-setup.sh
# Safe to run again: every step checks whether it is already done.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> Swap (the Angular build needs more than 1 GB of memory)"
if [ -n "$(swapon --show --noheadings)" ]; then
  echo "    swap already active, skipping"
else
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
fi
if [ -f /swapfile ] && ! grep -q '^/swapfile ' /etc/fstab; then
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    added /swapfile to /etc/fstab"
fi

echo "==> Docker Engine and the Compose plugin"
if docker compose version >/dev/null 2>&1; then
  echo "    already installed: $(docker compose version)"
else
  # Docker's official apt repository: https://docs.docker.com/engine/install/ubuntu/
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  codename="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codename} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

echo "==> rsync (deploy/deploy.sh copies the repository with it)"
if command -v rsync >/dev/null 2>&1; then
  echo "    already installed"
else
  apt-get update
  apt-get install -y rsync
fi

echo "==> Firewall: allow SSH, HTTP and HTTPS only"
# Ports published by Docker bypass ufw (Docker writes its own iptables rules), so ufw
# is not what protects the containers. The stack publishes only 80 and 443 publicly;
# postgres and nginx are published on 127.0.0.1 and are not reachable from outside.
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> /opt/forte"
mkdir -p /opt/forte/apps/api

echo
echo "Done. Next, create the two env files by hand (see the README):"
echo "  /opt/forte/.env"
echo "  /opt/forte/apps/api/.env"
