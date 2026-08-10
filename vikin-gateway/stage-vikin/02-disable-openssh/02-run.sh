#!/bin/bash
# Disable and mask OpenSSH server. Tailscale SSH is the only remote access.
# Explicitly lock root and vikin passwords so no local/console password login
# is possible — only Tailscale SSH (authenticated via tailnet identity) works.
set -euo pipefail

on_chroot <<'CHROOT'
# Disable and mask OpenSSH
systemctl disable ssh.service || true
systemctl disable ssh.socket || true
systemctl mask ssh.service
systemctl mask ssh.socket

# Lock root account password (passwd -l locks, prevents password login)
passwd -l root

# Lock vikin account password (Tailscale SSH uses tailnet identity, not PAM password)
passwd -l vikin
CHROOT
