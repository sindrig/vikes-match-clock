(function () {
  var APP_URL = "https://klukka.irdn.is";
  var OUTAGE_FAILURES = 2;
  var PROBE_TIMEOUT_MS = 10000;

  if (window.__kioskProbePending) return;
  window.__kioskProbePending = true;

  var onApp = location.origin === new URL(APP_URL).origin;
  var controller = new AbortController();
  var timeout = setTimeout(function () {
    controller.abort();
  }, PROBE_TIMEOUT_MS);

  fetch(APP_URL + "/?kiosk-probe=" + Date.now(), {
    cache: "no-store",
    mode: "no-cors",
    signal: controller.signal,
  })
    .then(function () {
      var failed = window.__kioskFailures || 0;
      window.__kioskFailures = 0;
      if (!onApp || failed >= OUTAGE_FAILURES) {
        location.replace(APP_URL);
        return;
      }
    })
    .catch(function () {
      if (onApp) {
        window.__kioskFailures = (window.__kioskFailures || 0) + 1;
      }
    })
    .finally(function () {
      clearTimeout(timeout);
      window.__kioskProbePending = false;
    });
})();
