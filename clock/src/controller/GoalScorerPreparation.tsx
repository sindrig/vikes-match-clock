import { useCallback, useState } from "react";
import { Button, Loader } from "rsuite";
import { usePerimeter } from "../contexts/FirebaseStateContext";
import { useController } from "../contexts/FirebaseStateContext";
import { useLocalState } from "../contexts/LocalStateContext";
import { GoalScorerPreparationStatus, GoalScorerPlayerStatus } from "../types";
import "./PerimeterControl.css";

const PLAYER_STATUS_LABELS: Record<GoalScorerPlayerStatus, string> = {
  preparing: "Undirbýr",
  ready: "Tilbúið — fagnmynd",
  fallback: "Tilbúið — skjöldur",
  unavailable: "Ekki tiltækt",
  failed: "Villa",
};

const PHASE_LABELS: Record<string, string> = {
  preparing: "Undirbýr",
  ready: "Tilbúið",
  failed: "Villa",
};

interface PlayerRowProps {
  playerId: string;
  name: string;
  number?: number | string;
  result: GoalScorerPreparationStatus["players"][string];
}

const PlayerRow = ({ playerId, name, number, result }: PlayerRowProps) => {
  const label = PLAYER_STATUS_LABELS[result.status];
  return (
    <div
      className={`goal-scorer-player goal-scorer-status-${result.status}`}
      data-testid={`goal-scorer-player-${playerId}`}
    >
      <span className="goal-scorer-player-identity">
        <span className="goal-scorer-player-number">
          {number !== undefined && number !== "" ? number : "–"}
        </span>
        <span className="goal-scorer-player-name">{name}</span>
      </span>
      <span className="goal-scorer-player-status">{label}</span>
      {result.error && (
        <span className="goal-scorer-player-error" title={result.error}>
          {result.error}
        </span>
      )}
    </div>
  );
};

const GoalScorerPreparation = () => {
  const { goalScorerPreparationStatus, requestGoalScorerPreparation } =
    usePerimeter();
  const {
    controller: { roster },
  } = useController();
  const { listenPrefix } = useLocalState();
  const [requesting, setRequesting] = useState(false);

  const home = roster?.home ?? [];
  const playersByResult = goalScorerPreparationStatus?.players ?? {};

  const handleRetry = useCallback(() => {
    setRequesting(true);
    requestGoalScorerPreparation(true)
      .catch(() => undefined)
      .finally(() => setRequesting(false));
  }, [requestGoalScorerPreparation]);

  const status = goalScorerPreparationStatus;
  const inFlight = status?.phase === "preparing";

  return (
    <div className="goal-scorer-preparation">
      <div className="goal-scorer-preparation-header">
        <span className="perimeter-brightness-title">
          Markaskorari — jaðarefni
        </span>
        {status && (
          <span className={`perimeter-phase-badge phase-${status.phase}`}>
            {PHASE_LABELS[status.phase] ?? status.phase}
          </span>
        )}
      </div>

      {status && status.total > 0 && (
        <div className="goal-scorer-preparation-counts">
          <span>Tilbúið: {status.readyCount}</span>
          <span>Skjöldur: {status.fallbackCount}</span>
          <span>Ekki tiltækt: {status.unavailableCount}</span>
          <span>Villur: {status.failedCount}</span>
        </div>
      )}

      {status?.error && (
        <div className="perimeter-status-error">{status.error}</div>
      )}

      {home.length === 0 ? (
        <p className="perimeter-hint">
          Engir heimaleikmenn í leikmannahóp. Jaðarefni fyrir markaskorara er
          undirbúið þegar leikmannahópur heimaliðs er sóttur.
        </p>
      ) : (
        <div className="goal-scorer-player-list">
          {home.map((player, index) => {
            const playerId =
              player.id !== undefined && player.id !== null
                ? String(player.id)
                : "";
            const result = playersByResult[playerId];
            if (!playerId || !result) {
              return (
                <div
                  key={`${playerId}-${index}`}
                  className="goal-scorer-player goal-scorer-status-unavailable"
                  data-testid={`goal-scorer-player-${playerId || `none-${index}`}`}
                >
                  <span className="goal-scorer-player-identity">
                    <span className="goal-scorer-player-number">
                      {player.number !== undefined && player.number !== ""
                        ? player.number
                        : "–"}
                    </span>
                    <span className="goal-scorer-player-name">
                      {player.name || "Óþekktur leikmaður"}
                    </span>
                  </span>
                  <span className="goal-scorer-player-status">
                    {playerId ? "Bíður" : "Ekki tiltækt"}
                  </span>
                </div>
              );
            }
            return (
              <PlayerRow
                key={playerId}
                playerId={playerId}
                name={player.name || "Óþekktur leikmaður"}
                number={player.number}
                result={result}
              />
            );
          })}
        </div>
      )}

      <div className="goal-scorer-preparation-actions">
        <Button
          size="sm"
          appearance="ghost"
          onClick={handleRetry}
          disabled={requesting || inFlight}
        >
          {requesting ? (
            <Loader size="xs" />
          ) : inFlight ? (
            "Undirbýr..."
          ) : (
            "Endurtaka undirbúning"
          )}
        </Button>
        {inFlight && (
          <span className="perimeter-hint">
            Efni er að undirbúast í bakgrunni. Jaðarskjárinn birtir enn almennu
            markamyndina þangað til valinn markaskorari er tilbúinn.
          </span>
        )}
      </div>
      <p className="perimeter-hint">
        Efni er gert fyrir hvern heimaleikmann úr fagnmynd hans ({listenPrefix}
        /players/&lt;id&gt;-fagn.png). Ef engin fagnmynd er til er staðall
        skjöldurinn notaður.
      </p>
    </div>
  );
};

export default GoalScorerPreparation;
