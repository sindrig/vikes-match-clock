#!/bin/bash
# Final cleanup: ensure no build artifacts or stale data remain.
set -euo pipefail

# Remove any pi-gen build-time apt caches inside the image
on_chroot <<'CHROOT'
apt-get clean
rm -rf /var/lib/apt/lists/*
CHROOT
