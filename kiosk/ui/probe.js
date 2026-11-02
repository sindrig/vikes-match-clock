(function () {
  var APP_URL = "https://klukka.irdn.is";
  var OUTAGE_FAILURES = 2;
  var PROBE_TIMEOUT_MS = 10000;

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
        location.replace(APP_URL);
        return;
      }
      if (!response.ok) throw new Error("Kiosk probe HTTP " + response.status);

      var failed = window.__kioskFailures || 0;
      window.__kioskFailures = 0;
      // The HTML shell has #root even before React mounts. Waiting for its
      // children would reload a normally starting app on every page load.
      var onAppDocument = onAppOrigin && document.getElementById("root");
      if (!onAppDocument || failed >= OUTAGE_FAILURES) {
        location.replace(APP_URL);
        return;
      }
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
