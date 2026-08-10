# vikin-gateway

Reproducible Raspberry Pi 4 (64-bit) image builder for Víkingur stadium
gateway devices. The flashed Pi boots, joins Tailscale automatically using a
baked-in reusable tagged auth key, and enables Tailscale SSH for remote
administration. No LAN SSH is exposed. Password logins for root and vikin are
explicitly locked — only Tailscale SSH is available.

## Prerequisites

- Docker (pi-gen builds run in a Docker container)
- A Tailscale auth key:
  - **Reusable** and **preauthorized**
  - Tagged with a tightly scoped tag (e.g. `tag:gateway`)
  - The key is baked into the image; if an SD card is lost, revoke/rotate
    the key immediately in the Tailscale admin console
- A Tailscale tailnet SSH ACL that permits access to `tag:gateway` devices
- Ethernet connectivity (Wi-Fi is optional; see Configuration)

## Quick start

```bash
cd vikin-gateway

# 1. Create your local secrets (gitignored)
cp secrets.env.example secrets.env
$EDITOR secrets.env

# 2. Run static checks (no build required)
./check.sh

# 3. Build the image (~20-40 min on first run)
./build.sh

# 4. Flash to SD card (find the exact image name in output/)
#    List available images:
ls -la output/*.img
#    Flash (adjust /dev/sdX — double-check the target!):
sudo dd if=output/<image-name>.img of=/dev/sdX bs=4M status=progress conv=fsync
#    Or use Raspberry Pi Imager: https://www.raspberrypi.com/software/

# 5. Insert SD card, power on, wait 2-3 min for enrollment
# 6. Find the device in your Tailscale admin console
# 7. SSH in via Tailscale
ssh vikin@<tailscale-ip-or-hostname>
```

## Configuration

All configuration lives in `secrets.env` (see `secrets.env.example`):

| Variable       | Required | Description                                                    |
|----------------|----------|----------------------------------------------------------------|
| `TS_AUTH_KEY`  | Yes      | Tailscale reusable preauthorized tagged auth key               |
| `WIFI_COUNTRY` | Yes      | Two-letter ISO country code (e.g. `IS`)                       |
| `TS_TAGS`      | Yes      | Comma-separated tags to advertise (e.g. `tag:gateway`)         |
| `TS_HOSTNAME`  | No       | Device hostname (default: `vikin-gateway`)                     |
| `WIFI_SSID`    | No       | Wi-Fi network name (omit for Ethernet-only; paired with PSK)  |
| `WIFI_PSK`     | No       | WPA2-Personal passphrase (omit for Ethernet-only; paired with SSID) |

`WIFI_SSID` and `WIFI_PSK` must both be set or both unset. Setting only one
is an error.

Wi-Fi is optional. If omitted, the device uses Ethernet only. You can set
them later by editing the NetworkManager connection profile on the device.

## Tailscale ACL policy

Your Tailscale ACL must authorize the tags and permit SSH. Here is a
concrete least-privilege policy:

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
  The build validates tag format but cannot verify the key's tag assignments.
- **Tags are policy identities, not technically immutable.** In Tailscale's ACL
  model, tags are identifiers referenced in `tagOwners`, `acls`, and `ssh`
  rules. A tag can be renamed or deleted in the Tailscale admin console at any
  time. "Immutable" in the Tailscale docs means that once a device claims a tag,
  the tag assignment persists until explicitly removed — it does not mean the
  tag itself cannot be modified in policy. Always verify your ACL references
  match the actual tag names.

## How it works

1. `build.sh` validates `secrets.env`, renders temporary config files
   (enrollment config + raw auth key file), and invokes pi-gen's Docker
   build with a custom `stage-vikin` stage appended to the standard stage
   list (`stage0 stage1 stage2 stage-vikin`). pi-gen is pinned to branch
   `bookworm-arm64` at a specific commit for reproducibility.
2. The custom stage installs Tailscale from the official **signed apt
   repository** (no `curl | sh`), explicitly locks root/vikin passwords,
   conditionally configures NetworkManager Wi-Fi, disables OpenSSH, and
   installs a first-boot enrollment systemd service with indefinite retry.
3. On first boot, `tailscale-enroll.service` waits for `tailscaled.service`
   and network connectivity, runs `tailscale up` with
   `--auth-key=file:/etc/tailscale-auth-key` (the key is read from the file
   by the CLI — never placed in argv or the process environment), advertises
   configured tags, enables Tailscale SSH, then **securely shreds** the auth
   key file.
4. After enrollment, the device appears in your tailnet (tagged as configured)
   and is accessible via Tailscale SSH.

## Security notes

- Tailscale is installed from the official signed apt repository using the
  `signed-by` directive — no unsigned `curl | sh` installation.
- The auth key is stored as a raw key (no prefix) in a `0600 root:root` file
  at `/etc/tailscale-auth-key` inside the image. The enrollment script passes
  it to `tailscale up` via `--auth-key=file:` — the CLI reads the key from
  the file directly. The key is never placed in argv or the process
  environment. The key is never echoed in logs, and is securely shredded
  (via `shred -u`) after successful enrollment. On flash media (SD cards,
  eMMC), shred's overwrites may not reach the physical blocks due to wear
  leveling — treat a lost card as a compromised credential and revoke the key.
- The enrollment config (hostname, tags) is in a separate `0600` file; the
  script parses it safely with `IFS='='` — no `source` or `eval` of
  arbitrary files.
- Root and vikin passwords are explicitly locked via `passwd -l` in the
  build stage, not just set to `!` in pi-gen config.
- OpenSSH is disabled and masked; passwords and root login are locked.
- The only remote access mechanism is Tailscale SSH (authenticated via your
  tailnet identity — no baked SSH keys).
- The systemd service retries enrollment indefinitely (60s restart interval)
  so the device will eventually enroll even after extended connectivity outages.
- An Internet path (Ethernet or configured Wi-Fi) is required for the first
  boot enrollment. Without connectivity the device retries continuously.
- Treat a lost SD card like a compromised credential: revoke the auth key
  and rotate the tag's key in the Tailscale admin console.

## Flashing

Find the exact image name produced by the build:

```bash
ls output/*.img
```

Flash using `dd` or [Raspberry Pi Imager](https://www.raspberrypi.com/software/):

```bash
# dd (Linux/macOS) — replace <image> with the actual filename and /dev/sdX
# with the correct target device. Double-check the target to avoid data loss.
sudo dd if=output/<image>.img of=/dev/sdX bs=4M status=progress conv=fsync

# Verify the write completed successfully
sudo cmp output/<image>.img /dev/sdX
```

### Safe flashing procedure

1. **Identify the target device:** Run `lsblk` before and after inserting the
   SD card to identify the correct `/dev/sdX` device.
2. **Unmount any auto-mounted partitions:** `sudo umount /dev/sdX*`
3. **Write the image:** `sudo dd if=output/<image>.img of=/dev/sdX bs=4M status=progress conv=fsync`
4. **Verify (optional but recommended):** `sudo cmp output/<image>.img /dev/sdX`
5. **Eject:** `sudo eject /dev/sdX`

## Recovery

If a device fails to enroll:

1. Check that Ethernet or the configured Wi-Fi is reachable from the Pi.
2. Check the Tailscale admin console for the device.
3. If the SD card is readable, check `/var/log/tailscale-enroll.log` for
   errors. The service retries indefinitely — a device that temporarily lost
   connectivity will eventually enroll when connectivity returns.
4. As a last resort, re-flash with a fresh image (the auth key is the same
   unless rotated).

The log file path is `/var/log/tailscale-enroll.log` (written by the systemd
service via `StandardOutput=append:...`). This is **not** in the systemd
journal — it is a plain log file on the root filesystem.

## Rotation

If an SD card is lost or compromised:

1. Go to the Tailscale admin console -> Settings -> Keys.
2. Revoke the compromised auth key.
3. Generate a new key with the same tag(s) assigned.
4. Update `secrets.env` and rebuild images for remaining devices.
