(function () {
  var APP_URL = "https://klukka.irdn.is";
  var OUTAGE_FAILURES = 2;

  if (window.__kioskProbePending) return;
  window.__kioskProbePending = true;

  var onApp = location.origin === new URL(APP_URL).origin;

  fetch(APP_URL + "/?kiosk-probe=" + Date.now(), {
    cache: "no-store",
    mode: "no-cors",
  })
    .then(function () {
      var failed = window.__kioskFailures || 0;
      window.__kioskFailures = 0;
      if (!onApp || failed >= OUTAGE_FAILURES) {
        location.replace(APP_URL);
        return;
      }
      window.__kioskProbePending = false;
    })
    .catch(function () {
      window.__kioskProbePending = false;
      if (onApp) {
        window.__kioskFailures = (window.__kioskFailures || 0) + 1;
      }
    });
})();
