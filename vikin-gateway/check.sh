#!/usr/bin/env bash
# Static checks for vikin-gateway build system.
# No actual image build; no secrets required. Safe to run in CI.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE_DIR="${SCRIPT_DIR}/stage-vikin"
FAILURES=0

pass() { echo "  PASS: $*"; }
fail() { echo "  FAIL: $*"; FAILURES=$((FAILURES + 1)); }
warn() { echo "  WARN: $*"; }

echo "=== vikin-gateway static checks ==="
echo ""

# --- 1. Required files exist ---

echo "[1] Required files exist"
required_files=(
    "build.sh"
    "check.sh"
    "README.md"
    "secrets.env.example"
    "${STAGE_DIR}/prerun.sh"
    "${STAGE_DIR}/EXPORT_IMAGE"
    "${STAGE_DIR}/00-install-tailscale/00-run.sh"
    "${STAGE_DIR}/01-network-config/01-run.sh"
    "${STAGE_DIR}/02-disable-openssh/02-run.sh"
    "${STAGE_DIR}/03-enrollment-service/03-run.sh"
    "${STAGE_DIR}/03-enrollment-service/files/tailscale-enroll.sh"
    "${STAGE_DIR}/03-enrollment-service/files/tailscale-enroll.service"
    "${STAGE_DIR}/04-cleanup/04-run.sh"
)
for f in "${required_files[@]}"; do
    if [[ -f "${f}" ]]; then
        pass "${f}"
    else
        fail "${f} not found"
    fi
done
echo ""

# --- 2. Expected stage list ---

echo "[2] Expected stage list (stage-vikin stages)"
expected_stages=(
    "00-install-tailscale"
    "01-network-config"
    "02-disable-openssh"
    "03-enrollment-service"
    "04-cleanup"
)
for stage in "${expected_stages[@]}"; do
    if [[ -d "${STAGE_DIR}/${stage}" ]]; then
        pass "stage ${stage}/"
    else
        fail "stage ${stage}/ not found"
    fi
done
echo ""

# --- 3. Bash syntax checks ---

echo "[3] Bash syntax checks"
bash_files=(
    "build.sh"
    "check.sh"
    "${STAGE_DIR}/prerun.sh"
    "${STAGE_DIR}/00-install-tailscale/00-run.sh"
    "${STAGE_DIR}/01-network-config/01-run.sh"
    "${STAGE_DIR}/02-disable-openssh/02-run.sh"
    "${STAGE_DIR}/03-enrollment-service/03-run.sh"
    "${STAGE_DIR}/03-enrollment-service/files/tailscale-enroll.sh"
    "${STAGE_DIR}/04-cleanup/04-run.sh"
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

# --- 4. Build config checks ---

echo "[4] Build configuration checks"
build_sh="${SCRIPT_DIR}/build.sh"

if grep -q "DEPLOY_COMPRESSION=none" "${build_sh}" 2>/dev/null; then
    pass "DEPLOY_COMPRESSION=none in build.sh"
else
    fail "DEPLOY_COMPRESSION=none not set in build.sh"
fi

if grep -q "^EXPORT_IMAGE=1" "${build_sh}" 2>/dev/null; then
    fail "EXPORT_IMAGE=1 should not be in build.sh config (use stage EXPORT_IMAGE file)"
else
    pass "no EXPORT_IMAGE=1 in build.sh"
fi

if grep -q "PI_GEN_BRANCH" "${build_sh}" 2>/dev/null; then
    pass "PI_GEN_BRANCH defined in build.sh"
else
    fail "PI_GEN_BRANCH not defined in build.sh"
fi

if grep -q "PI_GEN_COMMIT" "${build_sh}" 2>/dev/null; then
    pass "PI_GEN_COMMIT defined in build.sh"
else
    fail "PI_GEN_COMMIT not defined in build.sh"
fi

# pi-gen uses WPA_COUNTRY, not WIFI_COUNTRY, for the Wi-Fi regulatory domain.
# Our build config must map our WIFI_COUNTRY secret to WPA_COUNTRY for pi-gen.
if grep -q 'WPA_COUNTRY=.*WIFI_COUNTRY' "${build_sh}" 2>/dev/null; then
    pass "build config maps WIFI_COUNTRY to WPA_COUNTRY for pi-gen"
else
    fail "build config missing WPA_COUNTRY mapping (pi-gen expects WPA_COUNTRY, not WIFI_COUNTRY)"
fi

# The custom stage script must reference WPA_COUNTRY (set by pi-gen from config).
network_script="${STAGE_DIR}/01-network-config/01-run.sh"
if grep -q 'WPA_COUNTRY' "${network_script}" 2>/dev/null; then
    pass "01-network-config uses WPA_COUNTRY (pi-gen variable name)"
else
    fail "01-network-config does not use WPA_COUNTRY (should reference pi-gen variable, not WIFI_COUNTRY)"
fi
if grep -q 'WIFI_COUNTRY' "${network_script}" 2>/dev/null; then
    fail "01-network-config still references WIFI_COUNTRY (should be WPA_COUNTRY in pi-gen context)"
else
    pass "01-network-config has no stale WIFI_COUNTRY references"
fi

# Tag normalization: build.sh must normalize whitespace out of TS_TAGS after validation.
if grep -q 'TS_TAGS=.*\[\[:space:\]\]' "${build_sh}" 2>/dev/null; then
    pass "TS_TAGS normalized (whitespace stripped) after validation"
else
    fail "TS_TAGS not normalized after validation (missing whitespace removal)"
fi

# Check prerun.sh contains copy_previous
if grep -q "copy_previous" "${STAGE_DIR}/prerun.sh" 2>/dev/null; then
    pass "prerun.sh calls copy_previous"
else
    fail "prerun.sh does not call copy_previous"
fi
echo ""

# --- 5. No secrets tracked by git ---

echo "[5] No secrets or artifacts accidentally tracked by git"
cd "${SCRIPT_DIR}"
git_tracked_secrets=()
# Check if running inside a git repo
if git rev-parse --is-inside-work-tree &>/dev/null; then
    # Patterns that should never be tracked
    forbid_patterns=(
        "secrets.env"
        "ts-auth-key.env"
        "ts-auth-key"
        "ts-enroll.conf"
        "*.img"
        "output/"
        ".cache/"
    )
    for pattern in "${forbid_patterns[@]}"; do
        # Use git ls-files to check if any matching files are tracked
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

# --- 6. secrets.env.example has required variables ---

echo "[6] secrets.env.example contains required variables"
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

# --- 7. Service file correctness ---

echo "[7] Service file checks"
svc_file="${STAGE_DIR}/03-enrollment-service/files/tailscale-enroll.service"
# Check After= and Wants= lines for both targets
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

# --- 8. Enrollment script safety checks ---

echo "[8] Enrollment script safety checks"
enroll="${STAGE_DIR}/03-enrollment-service/files/tailscale-enroll.sh"
# Check for source/eval in non-comment lines only
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
# Auth key must be passed via --auth-key=file: (not --authkey, not env)
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
# Must not reference TS_AUTHKEY env var
if grep -v '^\s*#' "${enroll}" | grep -q 'TS_AUTHKEY' 2>/dev/null; then
    fail "enrollment script references TS_AUTHKEY env var (should use file: only)"
else
    pass "no TS_AUTHKEY env var references in enrollment script"
fi
echo ""

# --- 9. Cleanup and cache path checks ---

echo "[9] Cleanup and cache path checks"
if grep -q "PI_GEN_DIR" "${build_sh}" 2>/dev/null; then
    pass "cleanup references PI_GEN_DIR for cached stage cleanup"
else
    fail "cleanup does not reference PI_GEN_DIR"
fi
if grep -q "stage-vikin" "${build_sh}" 2>/dev/null; then
    pass "cleanup references stage-vikin cached files"
else
    fail "cleanup does not reference stage-vikin cached files"
fi
if grep -q "shred" "${build_sh}" 2>/dev/null; then
    pass "cleanup uses shred for secure deletion"
else
    fail "cleanup does not use shred"
fi
echo ""

# --- 10. Password locking in disable-openssh stage ---

echo "[10] Password locking checks"
ssh_stage="${STAGE_DIR}/02-disable-openssh/02-run.sh"
if grep -q "passwd -l root" "${ssh_stage}" 2>/dev/null; then
    pass "root password locked"
else
    fail "root password not explicitly locked"
fi
if grep -q "passwd -l vikin" "${ssh_stage}" 2>/dev/null; then
    pass "vikin password locked"
else
    fail "vikin password not explicitly locked"
fi
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
