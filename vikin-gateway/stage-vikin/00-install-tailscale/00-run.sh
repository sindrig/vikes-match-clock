#!/bin/bash
# Install Tailscale from the official signed apt repository.
# Uses the signed-by directive for repository verification (no curl-pipe-sh).
set -euo pipefail

on_chroot <<'CHROOT'
apt-get update
apt-get install -y ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg \
    -o /etc/apt/keyrings/tailscale-archive-keyring.gpg
chmod a+r /etc/apt/keyrings/tailscale-archive-keyring.gpg

echo "deb [signed-by=/etc/apt/keyrings/tailscale-archive-keyring.gpg] https://pkgs.tailscale.com/stable/debian bookworm main" \
    > /etc/apt/sources.list.d/tailscale.list

apt-get update
apt-get install -y tailscale
CHROOT
