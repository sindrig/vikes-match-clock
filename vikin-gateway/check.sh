#!/usr/bin/env bash
# Static checks for vikin-gateway cloud-init provisioning kit.
# No flashing required; no secrets required. Safe to run in CI.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTFS_DIR="${SCRIPT_DIR}/bootfs"
FAILURES=0

pass() { echo "  PASS: $*"; }
fail() { echo "  FAIL: $*"; FAILURES=$((FAILURES + 1)); }
warn() { echo "  WARN: $*"; }

echo "=== vikin-gateway static checks ==="
echo ""

# --- 1. Required files exist ---

echo "[1] Required files exist"
required_files=(
    "flash.sh"
    "check.sh"
    "README.md"
    "secrets.env.example"
    "${BOOTFS_DIR}/user-data"
    "${BOOTFS_DIR}/network-config"
    "${BOOTFS_DIR}/meta-data"
    "${BOOTFS_DIR}/files/usr/local/bin/tailscale-enroll.sh"
    "${BOOTFS_DIR}/files/usr/local/sbin/vikin-install-tailscale.sh"
    "${BOOTFS_DIR}/files/etc/systemd/system/tailscale-enroll.service"
)
for f in "${required_files[@]}"; do
    if [[ -f "${f}" ]]; then
        pass "${f}"
    else
        fail "${f} not found"
    fi
done
echo ""

# --- 2. Bash syntax checks ---

echo "[2] Bash syntax checks"
bash_files=(
    "flash.sh"
    "check.sh"
    "${BOOTFS_DIR}/files/usr/local/bin/tailscale-enroll.sh"
    "${BOOTFS_DIR}/files/usr/local/sbin/vikin-install-tailscale.sh"
)
for f in "${bash_files[@]}"; do
    if bash -n "${f}" 2>/dev/null; then
        pass "syntax: ${f}"
    else
        fail "syntax error in ${f}"
        bash -n "${f}" 2>&1 || true
    fi
done
echo ""

# --- 3. cloud-init YAML sanity (render with dummy secrets, then validate) ---

echo "[3] cloud-init YAML sanity"
ud="${BOOTFS_DIR}/user-data"
if head -n1 "${ud}" | grep -q '^#cloud-config$'; then
    pass "user-data starts with #cloud-config"
else
    fail "user-data does not start with #cloud-config"
fi

nc="${BOOTFS_DIR}/network-config"
if grep -q '^network:$' "${nc}" 2>/dev/null; then
    pass "network-config declares 'network:' top-level key"
else
    fail "network-config missing 'network:' top-level key"
fi

# Regression guard: 'regulatory-domain' broke netplan on RPi OS Trixie and
# took down ALL networking on first boot. It must never come back.
if grep -v '^\s*#' "${nc}" 2>/dev/null | grep -q 'regulatory-domain'; then
    fail "network-config contains 'regulatory-domain' (netplan-invalid on Trixie — took down all networking)"
else
    pass "network-config has no 'regulatory-domain' (regression guard)"
fi

# End-to-end render with dummy secrets into a temp sandbox, then validate the
# rendered YAML. Exercises the real flash.sh render pipeline without secrets.
_sandbox="$(mktemp -d)"
trap 'rm -rf "${_sandbox}"' EXIT
cp -r "${BOOTFS_DIR}" "${_sandbox}/bootfs"
cp "${SCRIPT_DIR}/flash.sh" "${_sandbox}/flash.sh"
cat > "${_sandbox}/secrets.env" <<'EOF'
TS_AUTH_KEY="tskey-auth-CHECK-DUMMY"
WIFI_COUNTRY="IS"
WIFI_SSID="check-network"
WIFI_PSK="check-psk-passphrase"
TS_TAGS="tag:gateway"
TS_HOSTNAME="vikin-gateway"
EOF
if (cd "${_sandbox}" && bash flash.sh --no-write >/dev/null 2>&1); then
    pass "flash.sh --no-write renders with dummy secrets"
else
    fail "flash.sh --no-write failed in sandbox (render pipeline broken)"
fi

if command -v python3 &>/dev/null; then
    if python3 -c 'import sys, yaml; yaml.safe_load(open(sys.argv[1]))' \
        "${_sandbox}/.cache/flash-staging/boot/user-data" 2>/dev/null; then
        pass "rendered user-data parses as valid YAML"
    else
        fail "rendered user-data is NOT valid YAML"
    fi
    if python3 -c 'import sys, yaml; yaml.safe_load(open(sys.argv[1]))' \
        "${_sandbox}/.cache/flash-staging/boot/network-config" 2>/dev/null; then
        pass "rendered network-config parses as valid YAML"
    else
        fail "rendered network-config is NOT valid YAML"
    fi
    # Semantic checks on the rendered output
    if python3 -c 'import sys, yaml; d = yaml.safe_load(open(sys.argv[1])); assert "eth0" in d["network"]["ethernets"], "eth0 missing"' \
        "${_sandbox}/.cache/flash-staging/boot/network-config" 2>/dev/null; then
        pass "rendered network-config configures eth0"
    else
        fail "rendered network-config missing eth0"
    fi
    if python3 -c 'import sys, yaml; d = yaml.safe_load(open(sys.argv[1])); assert "regulatory-domain" not in str(d), "regulatory-domain present"' \
        "${_sandbox}/.cache/flash-staging/boot/network-config" 2>/dev/null; then
        pass "rendered network-config has no regulatory-domain (regression guard)"
    else
        fail "rendered network-config contains regulatory-domain"
    fi
    if grep -q 'check-network' "${_sandbox}/.cache/flash-staging/root/etc/NetworkManager/system-connections/wifi.nmconnection" 2>/dev/null; then
        pass "Wi-Fi rendered as NM connection profile on rootfs"
    else
        fail "Wi-Fi NM connection profile missing from rendered rootfs"
    fi
else
    warn "python3 not found — skipping rendered YAML validation"
fi
echo ""

# --- 4. Templates contain only known placeholders (no secrets) ---

echo "[4] Template placeholder hygiene"
known_placeholders=(
    "__TS_HOSTNAME__"
    "__WIFI_COUNTRY__"
)
for tpl in "${BOOTFS_DIR}/user-data" "${BOOTFS_DIR}/network-config" "${BOOTFS_DIR}/meta-data"; do
    # Skip comment lines; scan for __NAME__ tokens
    while IFS= read -r token; do
        if [[ -z "${token}" ]]; then
            continue
        fi
        known=0
        for kp in "${known_placeholders[@]}"; do
            if [[ "${token}" == "${kp}" ]]; then
                known=1
                break
            fi
        done
        if [[ ${known} -eq 1 ]]; then
            pass "${tpl}: placeholder ${token} is known"
        else
            fail "${tpl}: UNKNOWN placeholder ${token} (possible secret in template!)"
        fi
    done < <(grep -v '^\s*#' "${tpl}" 2>/dev/null | grep -oE '__[A-Za-z0-9_]+__' || true)
done
echo ""

# --- 5. Tailscale install script security ---

echo "[5] Install script checks"
install_script="${BOOTFS_DIR}/files/usr/local/sbin/vikin-install-tailscale.sh"
if grep -q 'signed-by=' "${install_script}" 2>/dev/null; then
    pass "install script uses signed-by apt repo directive"
else
    fail "install script missing signed-by directive"
fi
if grep -v '^\s*#' "${install_script}" | grep -qE 'curl .*\|.*sh' 2>/dev/null; then
    fail "install script uses curl-pipe-sh (forbidden)"
else
    pass "no curl-pipe-sh in install script"
fi
echo ""

# --- 6. Enrollment script safety checks ---

echo "[6] Enrollment script safety checks"
enroll="${BOOTFS_DIR}/files/usr/local/bin/tailscale-enroll.sh"
if grep -v '^\s*#' "${enroll}" | grep -q '\bsource\b\|\beval\b' 2>/dev/null; then
    fail "enrollment script uses source/eval (unsafe)"
else
    pass "no source/eval in enrollment script (non-comment lines)"
fi
if grep -q "CONF_FILE" "${enroll}" 2>/dev/null; then
    pass "reads config file (CONF_FILE)"
else
    fail "does not read CONF_FILE"
fi
if grep -v '^\s*#' "${enroll}" | grep -q '\-\-authkey' 2>/dev/null; then
    fail "enrollment script uses --authkey (use --auth-key=file: instead)"
else
    pass "no --authkey in enrollment script"
fi
if grep -v '^\s*#' "${enroll}" | grep -q '\-\-auth-key=.*file:' 2>/dev/null; then
    pass "enrollment script uses --auth-key=file: (not env/argv)"
else
    fail "enrollment script does not use --auth-key=file:"
fi
if grep -v '^\s*#' "${enroll}" | grep -q 'TS_AUTHKEY' 2>/dev/null; then
    fail "enrollment script references TS_AUTHKEY env var (should use file: only)"
else
    pass "no TS_AUTHKEY env var references in enrollment script"
fi
echo ""

# --- 7. Service file correctness ---

echo "[7] Service file checks"
svc_file="${BOOTFS_DIR}/files/etc/systemd/system/tailscale-enroll.service"
after_line="$(grep '^After=' "${svc_file}" 2>/dev/null || true)"
wants_line="$(grep '^Wants=' "${svc_file}" 2>/dev/null || true)"
if echo "${after_line}" | grep -q "tailscaled.service"; then
    pass "After= includes tailscaled.service"
else
    fail "After= missing tailscaled.service"
fi
if echo "${after_line}" | grep -q "network-online.target"; then
    pass "After= includes network-online.target"
else
    fail "After= missing network-online.target"
fi
if echo "${wants_line}" | grep -q "tailscaled.service"; then
    pass "Wants= includes tailscaled.service"
else
    fail "Wants= missing tailscaled.service"
fi
if echo "${wants_line}" | grep -q "network-online.target"; then
    pass "Wants= includes network-online.target"
else
    fail "Wants= missing network-online.target"
fi
if grep -q "tailscale-enroll.log" "${svc_file}" 2>/dev/null; then
    pass "log output to /var/log/tailscale-enroll.log"
else
    fail "missing log output path"
fi
if grep -q "StartLimitIntervalSec=0" "${svc_file}" 2>/dev/null; then
    pass "StartLimitIntervalSec=0 (infinite retry)"
else
    fail "missing StartLimitIntervalSec=0 for infinite retry"
fi
if grep -q "EnvironmentFile=" "${svc_file}" 2>/dev/null; then
    fail "service unit must not use EnvironmentFile= (auth key read via --auth-key=file:)"
else
    pass "no EnvironmentFile in service unit"
fi
echo ""

# --- 8. flash.sh checks ---

echo "[8] flash.sh checks"
flash_sh="${SCRIPT_DIR}/flash.sh"
if grep -q '\-\-no-write' "${flash_sh}" 2>/dev/null; then
    pass "flash.sh supports --no-write dry run"
else
    fail "flash.sh missing --no-write dry-run mode"
fi
if grep -q '__TS_HOSTNAME__' "${flash_sh}" 2>/dev/null; then
    pass "flash.sh renders __TS_HOSTNAME__"
else
    fail "flash.sh does not render __TS_HOSTNAME__"
fi
if grep -q '__WIFI_COUNTRY__' "${flash_sh}" 2>/dev/null; then
    pass "flash.sh renders __WIFI_COUNTRY__"
else
    fail "flash.sh does not render __WIFI_COUNTRY__"
fi
if grep -q 'wifi.nmconnection' "${flash_sh}" 2>/dev/null; then
    pass "flash.sh renders the Wi-Fi NM connection profile"
else
    fail "flash.sh does not render the Wi-Fi NM connection profile"
fi
if grep -q 'tailscale-auth-key' "${flash_sh}" 2>/dev/null; then
    pass "flash.sh writes the auth key to the rootfs"
else
    fail "flash.sh does not write the auth key to the rootfs"
fi
echo ""

# --- 9. No secrets tracked by git ---

echo "[9] No secrets or artifacts accidentally tracked by git"
cd "${SCRIPT_DIR}"
git_tracked_secrets=()
if git rev-parse --is-inside-work-tree &>/dev/null; then
    forbid_patterns=(
        "secrets.env"
        "ts-auth-key"
        "ts-enroll.conf"
        "*.img"
        ".cache/"
    )
    for pattern in "${forbid_patterns[@]}"; do
        while IFS= read -r tracked; do
            if [[ -n "${tracked}" ]]; then
                git_tracked_secrets+=("${tracked}")
            fi
        done < <(git ls-files -- "${pattern}" 2>/dev/null || true)
    done

    if [[ ${#git_tracked_secrets[@]} -eq 0 ]]; then
        pass "no secrets/artifacts tracked by git"
    else
        for f in "${git_tracked_secrets[@]}"; do
            fail "secret/artifact tracked by git: ${f}"
        done
    fi
else
    warn "not a git repository, skipping git tracking check"
fi
echo ""

# --- 10. secrets.env.example has required variables ---

echo "[10] secrets.env.example contains required variables"
example_file="${SCRIPT_DIR}/secrets.env.example"
required_vars=(TS_AUTH_KEY WIFI_COUNTRY TS_TAGS)
for var in "${required_vars[@]}"; do
    if grep -q "^${var}=" "${example_file}" 2>/dev/null; then
        pass "${var} defined in secrets.env.example"
    else
        fail "${var} missing from secrets.env.example"
    fi
done
echo ""

# --- Summary ---

echo "=== Summary ==="
if [[ ${FAILURES} -eq 0 ]]; then
    echo "All checks passed."
    exit 0
else
    echo "${FAILURES} check(s) FAILED."
    exit 1
fi
