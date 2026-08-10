#!/bin/bash
# Install the first-boot Tailscale enrollment service, config, and auth key.
set -euo pipefail

# Install the enrollment config (hostname + tags, non-secret, 0600)
install -m 600 files/ts-enroll.conf "${ROOTFS_DIR}/etc/tailscale-enroll.conf"

# Install the auth key (raw key, no prefix, 0600 root:root)
install -m 600 files/ts-auth-key "${ROOTFS_DIR}/etc/tailscale-auth-key"

# Install the enrollment script
install -m 755 files/tailscale-enroll.sh "${ROOTFS_DIR}/usr/local/bin/tailscale-enroll.sh"

# Install the systemd service unit
install -m 644 files/tailscale-enroll.service "${ROOTFS_DIR}/etc/systemd/system/tailscale-enroll.service"

# Enable the service for first boot
on_chroot <<'CHROOT'
systemctl enable tailscale-enroll.service
CHROOT
