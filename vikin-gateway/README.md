# vikin-gateway

SD card provisioning kit for Víkingur stadium gateway devices (Raspberry Pi 4).
The flashed Pi boots, joins Tailscale automatically using a baked-in reusable
tagged auth key, and enables Tailscale SSH for remote administration. No LAN
SSH is exposed. Password logins for root and vikin are explicitly locked — only
Tailscale SSH is available.

**No custom image build.** This uses a stock **Raspberry Pi OS Lite 64-bit
(Trixie)** image plus cloud-init: three config files are dropped onto the SD
card's boot partition and a handful of files onto the root filesystem. On first
boot the OS provisions itself.

## Prerequisites

- Linux host (the flash script mounts ext4 partitions; macOS users can flash
  with Raspberry Pi Imager and copy files manually, see [Manual flash](#manual-flash))
- A stock **Raspberry Pi OS Lite 64-bit (Trixie)** image — download from
  <https://www.raspberrypi.com/software/operating-systems/>. Must be a Trixie
  release (Nov 2025 or later), which ships with cloud-init built in.
- A Tailscale auth key:
  - **Reusable** and **preauthorized**
  - Tagged with a tightly scoped tag (e.g. `tag:gateway`)
  - The key is baked into the card; if an SD card is lost, revoke/rotate the
    key immediately in the Tailscale admin console
- A Tailscale tailnet SSH ACL that permits access to `tag:gateway` devices
- Ethernet connectivity (Wi-Fi is optional backup; see Configuration)

## Quick start

```bash
cd vikin-gateway

# 1. Create your local secrets (gitignored)
cp secrets.env.example secrets.env
$EDITOR secrets.env

# 2. Run static checks (no flashing required)
./check.sh

# 3. Flash + provision an SD card
#    Find the correct device with `lsblk` BEFORE inserting the card, then again
#    after, so you know which /dev/sdX is the card. Double-check the target!
sudo ./flash.sh --image <path-to-raspios-lite-trixie.img> --device /dev/sdX

# 4. Insert SD card, power on, wait 2-3 min for enrollment
# 5. Find the device in your Tailscale admin console
# 6. SSH in via Tailscale
ssh vikin@<tailscale-ip-or-hostname>
```

To verify the downloaded image before flashing, pass the expected checksum:

```bash
sudo ./flash.sh --image <img> --device /dev/sdX --sha256 <sha256-of-img>
```

## Configuration

All configuration lives in `secrets.env` (see `secrets.env.example`):

| Variable       | Required | Description                                                    |
|----------------|----------|----------------------------------------------------------------|
| `TS_AUTH_KEY`  | Yes      | Tailscale reusable preauthorized tagged auth key               |
| `WIFI_COUNTRY` | Yes      | Two-letter ISO country code (e.g. `IS`)                       |
| `TS_TAGS`      | Yes      | Comma-separated tags to advertise (e.g. `tag:gateway`)         |
| `TS_HOSTNAME`  | No       | Device hostname (default: `vikin-gateway`)                     |
| `WIFI_SSID`    | No       | Wi-Fi network name — optional backup uplink; paired with PSK  |
| `WIFI_PSK`     | No       | WPA2-Personal passphrase — optional backup uplink; paired with SSID |

`WIFI_SSID` and `WIFI_PSK` must both be set or both unset. Setting only one is
an error. Neither may contain double quotes or semicolons.

Ethernet is the primary uplink. If Wi-Fi is configured, it is written by
`flash.sh` as a NetworkManager connection profile directly onto the root
filesystem (`0600 root:root`), with a lower autoconnect priority than the
default wired connection — NetworkManager only activates it when Ethernet is
unavailable (automatic failover). You can also change Wi-Fi later by editing
the NetworkManager connection profile on the device.

> **Known limitation:** NetworkManager considers a wired link with a DHCP
> lease "connected" even if that network has no internet. If the stadium LAN
> provides DHCP but no internet, Wi-Fi will **not** auto-fail-over on its own —
> the enrollment service will keep retrying over Ethernet. If your stadium LAN
> is isolated, set `WIFI_SSID`/`WIFI_PSK` and prefer connecting the Pi's
> Ethernet to a network with internet, or we can add connectivity-based
> failover later.

## Tailscale ACL policy

Your Tailscale ACL must authorize the tags and permit SSH. Here is a concrete
least-privilege policy:

```jsonc
{
  "tagOwners": {
    // Members of group:infra can create/claim tag:gateway devices.
    "tag:gateway": ["group:infra"]
  },
  "acls": [
    {
      // No inbound ACLs needed for gateways by default.
      // Add rules here if gateways need to receive traffic.
      // e.g.: "action": "accept", "src": ["*"], "dst": ["tag:gateway:*"]
    }
  ],
  "ssh": [
    {
      // Allow members of group:infra to SSH to gateway devices as vikin.
      "action": "accept",
      "src":    ["group:infra"],
      "dst":    ["tag:gateway"],
      "users":  ["vikin"]
    }
  ]
}
```

### Important: tags and auth keys

- **The operator must assign the tag(s) in the reusable auth key itself**
  when generating it in the Tailscale admin console (Settings -> Keys ->
  Generate auth key -> Tags). If the key lacks the tag assignment, `tailscale up
  --advertise-tags` will fail silently or be ignored.
- **`TS_TAGS` in `secrets.env` must match the tags assigned to the auth key.**
  `flash.sh` validates tag format but cannot verify the key's tag assignments.
- **Tags are policy identities, not technically immutable.** In Tailscale's ACL
  model, tags are identifiers referenced in `tagOwners`, `acls`, and `ssh`
  rules. A tag can be renamed or deleted in the Tailscale admin console at any
  time. "Immutable" in the Tailscale docs means that once a device claims a tag,
  the tag assignment persists until explicitly removed — it does not mean the
  tag itself cannot be modified in policy. Always verify your ACL references
  match the actual tag names.

## How it works

1. `flash.sh` validates `secrets.env`, renders the provisioning files into
   `.cache/flash-staging/`, writes the stock image to the SD card with `dd`,
   then mounts the two partitions and installs the files:
   - **Boot partition** (`user-data`, `network-config`, `meta-data`) — these
     are cloud-init's standard first-boot input files. Raspberry Pi OS Trixie
     ships cloud-init natively and applies them automatically on first boot.
     `network-config` configures ethernet only — it must stay minimal because
     cloud-init renders it to netplan, and netplan rejects the whole file on
     any unknown key (this previously took down all networking).
   - **Root filesystem** — the Tailscale enrollment service unit, the
     enrollment script, the enrollment config (hostname + tags), the raw auth
     key (`0600 root:root`), and optionally a NetworkManager Wi-Fi profile
     (`0600 root:root`, independent of netplan).
2. On first boot, cloud-init creates the `vikin` user (password locked, no SSH
   keys), runs the Tailscale install script (official signed apt repository —
   no `curl | sh`; it waits for network and retries until Tailscale is
   installed), sets the Wi-Fi regulatory country, starts the enrollment
   service, then masks OpenSSH and locks the root/vikin passwords.
3. `tailscale-enroll.service` waits for `tailscaled.service` and network
   connectivity, runs `tailscale up` with `--auth-key=file:/etc/tailscale-auth-key`
   (the key is read from the file by the CLI — never placed in argv or the
   process environment), advertises configured tags, enables Tailscale SSH,
   then **securely shreds** the auth key file. It retries indefinitely (60s
   restart interval) so the device eventually enrolls even after a long
   connectivity outage, and it self-heals: if Tailscale is missing or
   `tailscaled` is not running, it re-runs the install script and starts the
   daemon itself.
4. After enrollment, the device appears in your tailnet (tagged as configured)
   and is accessible via Tailscale SSH.

## Security notes

- Tailscale is installed from the official signed apt repository using the
  `signed-by` directive — no unsigned `curl | sh` installation.
- The auth key is stored as a raw key (no prefix) in a `0600 root:root` file at
  `/etc/tailscale-auth-key` **on the ext4 root filesystem** (written by
  `flash.sh`, not on the FAT32 boot partition). The enrollment script passes it
  to `tailscale up` via `--auth-key=file:` — the CLI reads the key from the
  file directly. The key is never placed in argv or the process environment,
  and is securely shredded (via `shred -u`) after successful enrollment. On
  flash media (SD cards, eMMC), shred's overwrites may not reach the physical
  blocks due to wear leveling — treat a lost card as a compromised credential
  and revoke the key.
- The `user-data`/`network-config` files on the FAT32 boot partition contain no
  secrets (hostname, tags are non-secret config). Wi-Fi credentials live in a
  `0600 root:root` NetworkManager profile **on the ext4 root filesystem**, not
  on the FAT32 partition.
- The enrollment config (hostname, tags) is in a separate `0600` file; the
  script parses it safely with `IFS='='` — no `source` or `eval` of arbitrary
  files.
- Root and vikin passwords are explicitly locked via `passwd -l` on first boot,
  and OpenSSH is disabled and masked; passwords and root login are locked.
- The only remote access mechanism is Tailscale SSH (authenticated via your
  tailnet identity — no baked SSH keys).
- The systemd service retries enrollment indefinitely (60s restart interval)
  so the device will eventually enroll even after extended connectivity outages.
- An Internet path (Ethernet or configured Wi-Fi) is required for the first
  boot enrollment. Without connectivity the device retries continuously.
- Treat a lost SD card like a compromised credential: revoke the auth key and
  rotate the tag's key in the Tailscale admin console.

## Manual flash

If you don't want to use `flash.sh` (e.g. on macOS), the same result can be
achieved with Raspberry Pi Imager plus a card reader:

1. Flash the stock Raspberry Pi OS Lite 64-bit (Trixie) image with
   [Raspberry Pi Imager](https://www.raspberrypi.com/software/) (standard
   options, no customization needed).
2. Re-insert the card so its partitions mount.
3. Copy the **rendered** boot files into the `bootfs` (FAT32) partition:
   ```bash
   cd vikin-gateway
   ./flash.sh --no-write   # render provisioning files into .cache/flash-staging/
   cp .cache/flash-staging/boot/{user-data,meta-data,network-config} /media/$USER/bootfs/
   ```
4. Copy the rootfs files into the `rootfs` (ext4) partition:
   ```bash
   sudo cp .cache/flash-staging/root/etc/tailscale-enroll.conf /media/$USER/rootfs/etc/
   sudo cp .cache/flash-staging/root/etc/tailscale-auth-key /media/$USER/rootfs/etc/
   sudo cp .cache/flash-staging/root/usr/local/bin/tailscale-enroll.sh /media/$USER/rootfs/usr/local/bin/
   sudo cp .cache/flash-staging/root/usr/local/sbin/vikin-install-tailscale.sh /media/$USER/rootfs/usr/local/sbin/
   sudo cp .cache/flash-staging/root/etc/systemd/system/tailscale-enroll.service /media/$USER/rootfs/etc/systemd/system/
   # Only if Wi-Fi is configured in secrets.env:
   sudo cp .cache/flash-staging/root/etc/NetworkManager/system-connections/wifi.nmconnection \
       /media/$USER/rootfs/etc/NetworkManager/system-connections/
   ```
   Then set ownership (`root:root`) and permissions (enroll.conf/auth-key/wifi
   profile `0600`, scripts `0755`, service `0644`) on the copies.
5. Eject, insert into the Pi, power on.

## Recovery

If a device fails to enroll:

1. Check that Ethernet or the configured Wi-Fi is reachable from the Pi.
2. Check the Tailscale admin console for the device.
3. If the SD card is readable, check `/var/log/tailscale-enroll.log` for
   errors. The service retries indefinitely — a device that temporarily lost
   connectivity will eventually enroll when connectivity returns.
4. As a last resort, re-flash with a fresh card (the auth key is the same
   unless rotated).

### Troubleshooting: Pi sees no Wi-Fi networks at all

If the device reports zero visible Wi-Fi networks (while other devices see
many), the Wi-Fi regulatory country is almost certainly unset — the radio
won't scan in the default world domain. Fix it live:

```bash
sudo raspi-config nonint do_wifi_country <CC>   # e.g. IS
nmcli dev wifi rescan
nmcli dev wifi list
```

The kit sets the country as the **first** cloud-init step specifically so this
cannot deadlock first-boot enrollment (an earlier ordering put the install
script first, which waited for a network the radio couldn't see).

The log file path is `/var/log/tailscale-enroll.log` (written by the systemd
service via `StandardOutput=append:...`). This is **not** in the systemd
journal — it is a plain log file on the root filesystem.

## Rotation

If an SD card is lost or compromised:

1. Go to the Tailscale admin console -> Settings -> Keys.
2. Revoke the compromised auth key.
3. Generate a new key with the same tag(s) assigned.
4. Update `secrets.env` and re-flash remaining devices.
