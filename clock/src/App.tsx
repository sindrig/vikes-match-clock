import { useEffect } from "react";
import { Button, ButtonGroup } from "rsuite";
import { RingLoader } from "react-spinners";
import {
  useFirebaseState,
  useController,
  useMatch,
} from "./contexts/FirebaseStateContext";
import { useLocalState } from "./contexts/LocalStateContext";
import { firebaseAuth } from "./firebaseAuth";
import Controller from "./controller/Controller";
import MatchActions from "./controller/MatchActions";
import RefreshHandler from "./controller/RefreshHandler";
import AssetComponent from "./controller/asset/Asset";

import ScoreBoard from "./screens/ScoreBoard";
import Idle from "./screens/Idle";

import { VIEWS, Sports, getBackground } from "./constants";
import StateListener from "./StateListener";
import MatchController from "./match-controller/MatchController";
import useGlobalShortcuts from "./hooks/useGlobalShortcuts";

import "./App.css";

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

function App() {
  useGlobalShortcuts();
  const { controller, view: viewState, ready } = useFirebaseState();
  const { auth, listenPrefix, setListenPrefix, setScreenViewport } =
    useLocalState();

  const { view } = controller;
  const { vp, background } = viewState;
  const asset = controller.currentAsset || null;

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
        </div>
        {asset ? (
          <div className="overlay-container" style={vp.style}>
            <AssetComponent asset={asset.asset} time={asset.time} />
          </div>
        ) : null}
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

  // State 3: authenticated — full UI with disconnect/logout button
  const disconnect = () => {
    setScreenViewport(null);
    setListenPrefix("");
    firebaseAuth.logout().catch(console.error);
  };

  const showController = view === VIEWS.match || view === VIEWS.idle;
  const previewWidth = 350;
  const previewHeight = Math.round((previewWidth / 16) * 9);
  const previewScale = Math.min(1, previewWidth / (vp.style.width || 960));

  return (
    <div>
      {view === VIEWS.control ? <MatchController /> : null}
      {showController && (
        <div className="controller-layout">
          <div className="controller-controls">
            <Controller />
          </div>
          <div className="controller-sidebar">
            <div className="preview-and-controls">
              <div
                className="scoreboard-preview"
                style={{ width: previewWidth, height: previewHeight }}
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
                </div>
              </div>
              <ViewModeButtons />
            </div>
            <MatchActions />
          </div>
        </div>
      )}
      {!showController && (
        <div className="App" style={style}>
          {renderAppContents()}
        </div>
      )}
      {asset ? (
        <div className="overlay-container" style={vp.style}>
          <AssetComponent asset={asset.asset} time={asset.time} />
        </div>
      ) : null}
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
