(function () {
  var APP_URL = "https://klukka.irdn.is";
  var OUTAGE_FAILURES = 2;
  var PROBE_TIMEOUT_MS = 10000;
  // Keep in sync with connectivity.rs's native retry interval.
  var RETRY_INTERVAL_MS = 60000;
  var RECOVERY_KEY = "vikes.kiosk.recoveryAfter";

  function recover() {
    var now = Date.now();
    try {
      var stored = window.sessionStorage.getItem(RECOVERY_KEY);
      var retryAfter = Number(stored);
      // Expired, malformed or far-future values must not strand the kiosk
      // (including after a system-clock change). Storage is per tab and origin.
      if (
        String(retryAfter) === stored &&
        Number.isSafeInteger(retryAfter) &&
        retryAfter > now &&
        retryAfter <= now + RETRY_INTERVAL_MS
      ) {
        return false;
      }
      // Reserve the next attempt BEFORE navigating: page-load injection runs
      // again in a fresh document, even when canonical / still returns an error.
      window.sessionStorage.setItem(
        RECOVERY_KEY,
        String(now + RETRY_INTERVAL_MS),
      );
    } catch {
      // Opaque error origins or blocked/full storage cannot retain a deadline.
      // Wait one interval in each document rather than loop on every load.
      if (
        !Number.isSafeInteger(window.__kioskRecoveryAfter) ||
        window.__kioskRecoveryAfter > now + RETRY_INTERVAL_MS
      ) {
        window.__kioskRecoveryAfter = now + RETRY_INTERVAL_MS;
        return false;
      }
      if (window.__kioskRecoveryAfter > now) return false;
    }
    window.__kioskRecoveryAfter = now + RETRY_INTERVAL_MS;
    location.replace(APP_URL);
    return true;
  }

  if (window.__kioskProbePending) return;
  window.__kioskProbePending = true;

  var onAppOrigin = location.origin === new URL(APP_URL).origin;
  var controller = new AbortController();
  var timeout = setTimeout(function () {
    controller.abort();
  }, PROBE_TIMEOUT_MS);

  fetch(APP_URL + "/?kiosk-probe=" + Date.now(), {
    cache: "no-store",
    mode: onAppOrigin ? "same-origin" : "no-cors",
    signal: controller.signal,
  })
    .then(function (response) {
      // Bootstrap and WebView error pages may be cross-origin. An opaque
      // response proves reachability only; navigate to inspect the app there.
      if (!onAppOrigin && response.type === "opaque") {
        recover();
        return;
      }
      if (!response.ok) throw new Error("Kiosk probe HTTP " + response.status);

      var failed = window.__kioskFailures || 0;
      // The HTML shell has #root even before React mounts. Waiting for its
      // children would reload a normally starting app on every page load.
      var onAppDocument = onAppOrigin && document.getElementById("root");
      if (!onAppDocument || failed >= OUTAGE_FAILURES) {
        // Retain a sustained outage until its recovery navigation is allowed.
        if (recover()) window.__kioskFailures = 0;
        return;
      }
      window.__kioskFailures = 0;
    })
    .catch(function () {
      if (onAppOrigin) {
        window.__kioskFailures = (window.__kioskFailures || 0) + 1;
      }
    })
    .finally(function () {
      clearTimeout(timeout);
      window.__kioskProbePending = false;
    });
})();
