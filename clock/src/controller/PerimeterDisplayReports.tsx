import { useEffect, useState } from "react";
import { Badge } from "rsuite";
import useScreenReports from "../hooks/useScreenReports";
import { usePerimeter } from "../contexts/FirebaseStateContext";
import { useLocalState } from "../contexts/LocalStateContext";

const HEARTBEAT_STALE_MS = 3 * 60 * 1000;
const REFRESH_INTERVAL_MS = 30_000;

const formatClock = (at: number): string =>
  at > 0
    ? new Date(at).toLocaleTimeString("is-IS", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "";

type ReportStatus = "error" | "stale" | "ok";

const STATUS_LABELS: Record<ReportStatus, string> = {
  error: "Villa",
  stale: "Ósvöruð",
  ok: "Í lagi",
};

/**
 * Lists every connected perimeter screen with its live diagnostics: the last
 * reported renderer error, a stale-heartbeat flag for wedged browsers, and a
 * warning when no perimeter screen is connected at all. Reports arrive on the
 * presence path, so a screen that disconnects (crash, power loss, network
 * drop) simply disappears from the list.
 */
export default function PerimeterDisplayReports() {
  const { getServerTime } = usePerimeter();
  const { listenPrefix } = useLocalState();
  const reports = useScreenReports(listenPrefix);

  // Ticking now so staleness (no Firebase event of its own) still flips.
  const [now, setNow] = useState(() => getServerTime());
  useEffect(() => {
    const tick = () => setNow(getServerTime());
    tick();
    const interval = setInterval(tick, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [getServerTime]);

  const perimeterScreens = reports.filter(
    (report) => report.displayKind === "perimeter",
  );

  return (
    <section className="perimeter-display-reports" aria-label="Skjáarvillur">
      <div className="perimeter-display-reports-header">
        <span className="perimeter-display-reports-title">
          Skjáarvillur (jaðarskjáir)
        </span>
        <span className="perimeter-display-reports-count">
          {perimeterScreens.length}{" "}
          {perimeterScreens.length === 1 ? "tengdur" : "tengdir"}
        </span>
      </div>
      {perimeterScreens.length === 0 ? (
        <div className="perimeter-display-reports-empty">
          Enginn jaðarskjár er tengdur. Athugaðu hvort tölvan sem birtir
          jaðarskjáinn er kveikt og tengd netinu.
        </div>
      ) : (
        perimeterScreens.map((report) => {
          const lastPulse = report.lastHeartbeat || report.connectedAt;
          const stale =
            now > 0 && lastPulse > 0 && now - lastPulse > HEARTBEAT_STALE_MS;
          const status: ReportStatus = report.error
            ? "error"
            : stale
              ? "stale"
              : "ok";
          return (
            <div
              key={report.connectionId}
              className={`perimeter-display-report status-${status}`}
            >
              <div className="perimeter-display-report-header">
                <span className="perimeter-display-report-name">
                  {report.label || "Jaðarskjár"}
                </span>
                {report.resolution && (
                  <span className="perimeter-display-report-resolution">
                    {report.resolution}
                  </span>
                )}
                <Badge
                  content={STATUS_LABELS[status]}
                  className={`perimeter-display-report-badge status-${status}`}
                />
              </div>
              {report.error ? (
                <div className="perimeter-display-report-error">
                  {report.error}
                  {report.errorAt > 0 && (
                    <span className="perimeter-display-report-time">
                      {" "}
                      kl. {formatClock(report.errorAt)}
                    </span>
                  )}
                </div>
              ) : stale ? (
                <div className="perimeter-display-report-error">
                  Skjárinn svarar ekki nýlega (síðasta merki kl.{" "}
                  {formatClock(lastPulse)}).
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </section>
  );
}
