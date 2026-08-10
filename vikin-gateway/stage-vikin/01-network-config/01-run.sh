#!/bin/bash
# Configure Wi-Fi via NetworkManager and set the Wi-Fi country.
# Wi-Fi profile is optional — Ethernet works out of the box.
set -euo pipefail

# Install the pre-rendered Wi-Fi connection profile if present
if [[ -f files/wifi.nmconnection ]]; then
    install -m 600 files/wifi.nmconnection "${ROOTFS_DIR}/etc/NetworkManager/system-connections/wifi.nmconnection"
fi

# Set Wi-Fi regulatory domain via raspi-config's non-interactive mode.
# This writes the country to /etc/default/crf and wpa_supplicant if present.
# pi-gen exposes the config variable as WPA_COUNTRY (not the secrets.env name).
on_chroot <<'CHROOT'
raspi-config nonint do_wifi_country "${WPA_COUNTRY}"
CHROOT
