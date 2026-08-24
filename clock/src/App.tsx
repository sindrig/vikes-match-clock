import { useEffect, useMemo, useState } from "react";
import { Button, ButtonGroup, Tooltip, Whisper } from "rsuite";
import CloseIcon from "@rsuite/icons/CloseOutline";
import { RingLoader } from "react-spinners";
import {
  useFirebaseState,
  useController,
  useMatch,
  useView,
  usePerimeter,
} from "./contexts/FirebaseStateContext";
import { useLocalState } from "./contexts/LocalStateContext";
import { firebaseAuth } from "./firebaseAuth";
import Controller from "./controller/Controller";
import ResyncNotice from "./controller/ResyncNotice";
import MatchActions from "./controller/MatchActions";
import MatchCountdownDisplay from "./controller/MatchCountdownDisplay";
import HomeTeamQuickActions from "./controller/HomeTeamQuickActions";
import RefreshHandler from "./controller/RefreshHandler";
import AssetComponent, { useDeferredAsset } from "./controller/asset/Asset";
import PlaybackBar from "./controller/asset/queue/PlaybackBar";
import SubstitutionInfo from "./controller/asset/queue/SubstitutionInfo";
import GoalScorerDialog from "./controller/GoalScorerDialog";

import ScoreBoard from "./screens/ScoreBoard";
import Idle from "./screens/Idle";
import MatchLifecycle from "./match/MatchLifecycle";

import { VIEWS, Sports, getBackground, DEFAULT_THEME } from "./constants";
import MatchController from "./match-controller/MatchController";
import useGlobalShortcuts from "./hooks/useGlobalShortcuts";
import useNightBlackout from "./hooks/useNightBlackout";
import useScreenPresence from "./hooks/useScreenPresence";
import { useThemeCssVars, resolveTheme } from "./hooks/useThemeCssVars";
import assetTypes from "./controller/asset/AssetTypes";
import { isVideoUrl, resolveGoalBackground } from "./utils/matchUtils";

import "./App.css";

const ScoreButtons = ({ side }: { side: "home" | "away" }) => {
  const { match, updateMatch, addGoal } = useMatch();
  const {
    renderAsset,
    controller: { roster },
  } = useController();
  const { setPerimeterOverlay } = usePerimeter();
  const { view } = useView();
  const { listenPrefix } = useLocalState();
  const scoreKeys = { home: "homeScore", away: "awayScore" } as const;
  const score = match[scoreKeys[side]];
  const [scorerDialogOpen, setScorerDialogOpen] = useState(false);

  const teamName = side === "home" ? match.homeTeam : match.awayTeam;
  const players = roster[side] || [];

  const handleGoal = () => {
    addGoal(side);
    if (side === "home") {
      const bucketName = "vikes-match-clock-firebase.appspot.com";
      setPerimeterOverlay({
        version: 1,
        id: crypto.randomUUID(),
        columns: [
          {
            durationMs: 10000,
            files: {
              "2": {
                name: "goal-48.mp4",
                source: `gs://${bucketName}/${listenPrefix}/perimeter/goal-48.mp4`,
              },
              "4": {
                name: "goal-40.mp4",
                source: `gs://${bucketName}/${listenPrefix}/perimeter/goal-40.mp4`,
              },
            },
          },
        ],
      });
      if (view.goalGif1) {
        renderAsset({
          key: view.goalGif1,
          type: isVideoUrl(view.goalGif1) ? assetTypes.VIDEO : assetTypes.IMAGE,
        });
        if (players.length > 0) {
          setScorerDialogOpen(true);
        }
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
        goalGif2={resolveGoalBackground(view)}
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
  const { clearPerimeterOverlay } = usePerimeter();

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
        onClick={() => {
          renderAsset(null);
          clearPerimeterOverlay();
        }}
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
  const { auth, listenPrefix, setListenPrefix, setScreenKey } = useLocalState();

  const { view } = controller;
  const {
    vp,
    background,
    blackoutStart,
    blackoutEnd,
    theme,
    themePreset,
    customPresets,
  } = viewState;
  const rawAsset = controller.currentAsset || null;
  const asset = useDeferredAsset(rawAsset);

  const isBlackedOut = useNightBlackout(blackoutStart, blackoutEnd, view);
  const themeCssVars = useThemeCssVars(themePreset, theme, customPresets);
  const effectiveTheme = useMemo(
    () => resolveTheme(themePreset, theme, customPresets),
    [themePreset, theme, customPresets],
  );

  const isAuthenticated = auth.isLoaded && !auth.isEmpty;

  useScreenPresence(isAuthenticated ? "" : listenPrefix);

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
    return <Controller />;
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

  /** Sanitize a URL for use inside CSS url() by encoding characters that could break out */
  const sanitizeCssUrl = (url: string): string =>
    url.replace(/[()'"\\]/g, (ch) => `\\${ch}`);

  const style: React.CSSProperties = {
    ...getBackground(isBlackedOut ? "Blackout" : background),
    // Theme background image overrides the background selector when set
    ...(effectiveTheme.backgroundImage && !isBlackedOut
      ? {
          backgroundImage: `url(${sanitizeCssUrl(effectiveTheme.backgroundImage)})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : {}),
    ...vp.style,
    ...themeCssVars,
  };

  // Static font-size overrides for the controller preview so that theme
  // font-size edits don't break the small preview layout (issue #178).
  // Font-family settings still apply — only sizes are pinned.
  const previewFontSizeOverrides: React.CSSProperties = {
    "--theme-score-font-size": DEFAULT_THEME.scoreBoxFontSize,
    "--theme-clock-font-size-min": DEFAULT_THEME.clockFontSizeMin,
    "--theme-clock-font-size-max": DEFAULT_THEME.clockFontSizeMax,
    "--theme-injury-font-size": DEFAULT_THEME.injuryTimeFontSize,
    "--theme-idle-text-font-size": DEFAULT_THEME.idleTextFontSize,
  } as React.CSSProperties;

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
            setScreenKey(null);
            setListenPrefix("");
          }}
          style={{ position: "fixed", bottom: 16, right: 16, zIndex: 9999 }}
        >
          Aftengja skjá
        </Button>
      </div>
    );
  }

  // State 3: authenticated, no listenPrefix — show ONLY screen selector
  if (!listenPrefix) {
    return <Controller />;
  }

  // State 4: authenticated + listenPrefix set — full UI with disconnect/logout buttons
  const disconnectScreen = () => {
    setScreenKey(null);
    setListenPrefix("");
  };

  const logout = () => {
    setScreenKey(null);
    setListenPrefix("");
    firebaseAuth.logout().catch(console.error);
  };

  const showController = view === VIEWS.match || view === VIEWS.idle;
  const showMatchControls = view !== VIEWS.idle;
  const scoreButtonWidth = 44;
  const sidebarWidth = 350;
  const previewWidth = sidebarWidth - scoreButtonWidth * 2;
  const vpWidth = vp.style.width || 960;
  const vpHeight = vp.style.height || 540;
  const previewScale = previewWidth / vpWidth;
  const previewHeight = Math.ceil(vpHeight * previewScale);

  return (
    <div>
      <MatchLifecycle />
      {view === VIEWS.control ? <MatchController /> : null}
      {showController && (
        <div className="controller-layout">
          <div className="controller-sidebar">
            <ResyncNotice />
            <div className="preview-and-controls">
              <div className="preview-with-scores">
                {showMatchControls ? (
                  <ScoreButtons side="home" />
                ) : (
                  <div style={{ width: scoreButtonWidth, flexShrink: 0 }} />
                )}
                <div
                  className="scoreboard-preview"
                  style={{ height: previewHeight }}
                >
                  <div
                    className="App"
                    style={{
                      ...style,
                      ...previewFontSizeOverrides,
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
                {showMatchControls ? (
                  <ScoreButtons side="away" />
                ) : (
                  <div style={{ width: scoreButtonWidth, flexShrink: 0 }} />
                )}
              </div>
              <ViewModeButtons />
            </div>
            {controller.activeQueueId ? (
              <PlaybackBar />
            ) : (
              asset && <ClearOverlayButton />
            )}
            <SubstitutionInfo />
            {showMatchControls && <MatchActions />}
            {showMatchControls && <MatchCountdownDisplay />}
            {showMatchControls && <HomeTeamQuickActions />}
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
      <ButtonGroup
        style={{ position: "fixed", bottom: 16, right: 16, zIndex: 9999 }}
      >
        <Button color="red" appearance="primary" size="lg" onClick={logout}>
          Útskrá
        </Button>
        <Button
          color="orange"
          appearance="primary"
          size="lg"
          onClick={disconnectScreen}
        >
          Aftengjast skjá
        </Button>
      </ButtonGroup>
    </div>
  );
}

export default App;
