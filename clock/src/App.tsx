import { Button } from "rsuite";
import { RingLoader } from "react-spinners";
import { useFirebaseState } from "./contexts/FirebaseStateContext";
import { useLocalState } from "./contexts/LocalStateContext";
import { firebaseAuth } from "./firebaseAuth";
import Controller from "./controller/Controller";
import RefreshHandler from "./controller/RefreshHandler";
import AssetComponent from "./controller/asset/Asset";

import ScoreBoard from "./screens/ScoreBoard";
import Idle from "./screens/Idle";

import { VIEWS, getBackground } from "./constants";
import StateListener from "./StateListener";
import MatchController from "./match-controller/MatchController";
import useGlobalShortcuts from "./hooks/useGlobalShortcuts";

import "./App.css";

function App() {
  useGlobalShortcuts();
  const { controller, view: viewState, ready } = useFirebaseState();
  const { auth, listenPrefix, setListenPrefix, setScreenViewport } =
    useLocalState();

  const { view } = controller;
  const { vp, background } = viewState;
  const asset = controller.currentAsset || null;

  const isAuthenticated = auth.isLoaded && !auth.isEmpty;

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

  return (
    <div>
      {view === VIEWS.control ? <MatchController /> : null}
      <div className="App" style={style}>
        {renderAppContents()}
      </div>
      {(view === VIEWS.match || view === VIEWS.idle) && <Controller />}
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
