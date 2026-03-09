import { useEffect, useState } from "react";
import { Button, ButtonGroup, Tooltip, Whisper } from "rsuite";
import CloseIcon from "@rsuite/icons/CloseOutline";
import { RingLoader } from "react-spinners";
import {
  useFirebaseState,
  useController,
  useMatch,
} from "./contexts/FirebaseStateContext";
import { useLocalState, useRemoteSettings } from "./contexts/LocalStateContext";
import { firebaseAuth } from "./firebaseAuth";
import Controller from "./controller/Controller";
import MatchActions from "./controller/MatchActions";
import RefreshHandler from "./controller/RefreshHandler";
import AssetComponent from "./controller/asset/Asset";
import GoalScorerDialog from "./controller/GoalScorerDialog";

import ScoreBoard from "./screens/ScoreBoard";
import Idle from "./screens/Idle";

import { VIEWS, Sports, getBackground } from "./constants";
import StateListener from "./StateListener";
import MatchController from "./match-controller/MatchController";
import useGlobalShortcuts from "./hooks/useGlobalShortcuts";
import useNightBlackout from "./hooks/useNightBlackout";
import { shouldShowGoalCelebration } from "./utils/matchUtils";
import baddi from "./images/baddi.gif";
import assetTypes from "./controller/asset/AssetTypes";

import "./App.css";

const ScoreButtons = ({ side }: { side: "home" | "away" }) => {
  const { match, updateMatch, addGoal } = useMatch();
  const {
    renderAsset,
    controller: { roster },
  } = useController();
  const { listenPrefix } = useRemoteSettings();
  const scoreKeys = { home: "homeScore", away: "awayScore" } as const;
  const score = match[scoreKeys[side]];
  const [scorerDialogOpen, setScorerDialogOpen] = useState(false);

  const teamName = side === "home" ? match.homeTeam : match.awayTeam;
  const players = roster[side] || [];

  const handleGoal = () => {
    addGoal(side);
    if (shouldShowGoalCelebration(match.matchType, teamName, listenPrefix)) {
      renderAsset({ key: baddi, type: assetTypes.IMAGE });
      if (players.length > 0) {
        setScorerDialogOpen(true);
      }
    }
  };

  return (
    <div
      className="preview-score-buttons"
      data-testid={`score-buttons-${side}`}
    >
      <Button
        size="sm"
        appearance="primary"
        color="green"
        onClick={handleGoal}
        block
      >
        +
      </Button>
      <Button
        size="sm"
        appearance="subtle"
        onClick={() => updateMatch({ [scoreKeys[side]]: score - 1 })}
        disabled={score <= 0}
        block
      >
        −
      </Button>
      <GoalScorerDialog
        open={scorerDialogOpen}
        players={players}
        teamName={teamName}
        onClose={() => setScorerDialogOpen(false)}
      />
    </div>
  );
};

const ViewModeButtons = () => {
  const { controller, selectView } = useController();
  const { match } = useMatch();
  const { view } = controller;
  const isHandball = match.matchType === Sports.Handball;

  return (
    <div className="view-mode-buttons">
      <ButtonGroup size="xs">
        <Button
          appearance={view === VIEWS.idle ? "primary" : "default"}
          onClick={() => selectView(VIEWS.idle)}
        >
          Idle
        </Button>
        <Button
          appearance={view === VIEWS.match ? "primary" : "default"}
          onClick={() => selectView(VIEWS.match)}
        >
          Match
        </Button>
        {isHandball && (
          <Button
            appearance={view === VIEWS.control ? "primary" : "default"}
            onClick={() => selectView(VIEWS.control)}
          >
            Control
          </Button>
        )}
      </ButtonGroup>
    </div>
  );
};

const tooltipClear = <Tooltip>Birtir aftur stöðu leiksins á skjá.</Tooltip>;

const ClearOverlayButton = () => {
  const { renderAsset } = useController();

  return (
    <Whisper
      placement="bottom"
      controlId="clearoverlay-id-hover"
      trigger="hover"
      speaker={tooltipClear}
    >
      <Button
        color="cyan"
        appearance="primary"
        size="sm"
        onClick={() => renderAsset(null)}
        block
      >
        <CloseIcon /> Hreinsa virkt overlay
      </Button>
    </Whisper>
  );
};

function App() {
  useGlobalShortcuts();
  const { controller, view: viewState, ready } = useFirebaseState();
  const { auth, listenPrefix, setListenPrefix, setScreenViewport } =
    useLocalState();

  const { view } = controller;
  const { vp, background, blackoutStart, blackoutEnd } = viewState;
  const asset = controller.currentAsset || null;

  const isBlackedOut = useNightBlackout(blackoutStart, blackoutEnd, view);

  const isAuthenticated = auth.isLoaded && !auth.isEmpty;

  // Apply viewport fontSize to the root <html> element so all rem-based
  // content (clocks, scores, etc.) scales to the physical screen config.
  useEffect(() => {
    if (vp.fontSize) {
      document.documentElement.style.fontSize = vp.fontSize;
    }
    return () => {
      document.documentElement.style.fontSize = "";
    };
  }, [vp.fontSize]);

  // State 1: no listenPrefix, not authenticated — Controller handles screen selector + login
  if (!listenPrefix && !isAuthenticated) {
    return (
      <div>
        <Controller />
        <StateListener />
      </div>
    );
  }

  // Show spinner while waiting for auth state or Firebase data to load
  if ((listenPrefix || isAuthenticated) && (!auth.isLoaded || !ready)) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <RingLoader color="#1675e0" size={80} />
      </div>
    );
  }

  const renderAppContents = () => {
    switch (view) {
      case VIEWS.match:
      case VIEWS.control:
        return <ScoreBoard />;
      case VIEWS.idle:
      default:
        if (isBlackedOut) return null;
        if (background !== "Blackout") {
          return <Idle />;
        }
        return null;
    }
  };

  const style: React.CSSProperties = {
    ...getBackground(background),
    ...vp.style,
  };

  // State 2: listenPrefix set, not authenticated — display screen + disconnect button only
  if (!isAuthenticated) {
    return (
      <div>
        <div className="App" style={style}>
          {renderAppContents()}
          {asset ? (
            <div className="overlay-container" style={vp.style}>
              <AssetComponent asset={asset.asset} time={asset.time} />
            </div>
          ) : null}
        </div>
        <RefreshHandler />
        <Button
          color="red"
          appearance="primary"
          size="lg"
          onClick={() => {
            setScreenViewport(null);
            setListenPrefix("");
          }}
          style={{ position: "fixed", bottom: 16, right: 16, zIndex: 9999 }}
        >
          Aftengja skjá
        </Button>
        <StateListener />
      </div>
    );
  }

  // State 3: authenticated, no listenPrefix — show ONLY screen selector
  if (!listenPrefix) {
    return (
      <div>
        <Controller />
        <StateListener />
      </div>
    );
  }

  // State 4: authenticated + listenPrefix set — full UI with disconnect/logout button
  const disconnect = () => {
    setScreenViewport(null);
    setListenPrefix("");
    firebaseAuth.logout().catch(console.error);
  };

  const showController = view === VIEWS.match || view === VIEWS.idle;
  const showMatchControls = view !== VIEWS.idle;
  const scoreButtonWidth = 44;
  const sidebarWidth = 350;
  const previewWidth = showMatchControls
    ? sidebarWidth - scoreButtonWidth * 2
    : sidebarWidth;
  const vpWidth = vp.style.width || 960;
  const vpHeight = vp.style.height || 540;
  const previewScale = previewWidth / vpWidth;
  const previewHeight = Math.ceil(vpHeight * previewScale);

  return (
    <div>
      {view === VIEWS.control ? <MatchController /> : null}
      {showController && (
        <div className="controller-layout">
          <div className="controller-sidebar">
            <div className="preview-and-controls">
              <div className="preview-with-scores">
                {showMatchControls && <ScoreButtons side="home" />}
                <div
                  className="scoreboard-preview"
                  style={{ height: previewHeight }}
                >
                  <div
                    className="App"
                    style={{
                      ...style,
                      transform: `scale(${previewScale})`,
                      transformOrigin: "top left",
                    }}
                  >
                    {renderAppContents()}
                    {asset ? (
                      <div className="overlay-container" style={vp.style}>
                        <AssetComponent asset={asset.asset} time={asset.time} />
                      </div>
                    ) : null}
                  </div>
                </div>
                {showMatchControls && <ScoreButtons side="away" />}
              </div>
              <ViewModeButtons />
            </div>
            {asset && <ClearOverlayButton />}
            {showMatchControls && <MatchActions />}
          </div>
          <div className="controller-controls">
            <Controller />
          </div>
        </div>
      )}
      {!showController && (
        <div className="App" style={style}>
          {renderAppContents()}
          {asset ? (
            <div className="overlay-container" style={vp.style}>
              <AssetComponent asset={asset.asset} time={asset.time} />
            </div>
          ) : null}
        </div>
      )}
      <Button
        color="red"
        appearance="primary"
        size="lg"
        onClick={disconnect}
        style={{ position: "fixed", bottom: 16, right: 16, zIndex: 9999 }}
      >
        Aftengja skjá
      </Button>
      <StateListener />
    </div>
  );
}

export default App;
