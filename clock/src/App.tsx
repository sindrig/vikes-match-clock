import { useFirebaseState } from "./contexts/FirebaseStateContext";
import { useLocalState } from "./contexts/LocalStateContext";
import Controller from "./controller/Controller";
import AssetComponent from "./controller/asset/Asset";

import ScoreBoard from "./screens/ScoreBoard";
import Idle from "./screens/Idle";

import { VIEWS } from "./reducers/controller";
import { getBackground } from "./reducers/view";
import StateListener from "./StateListener";
import MatchController from "./match-controller/MatchController";
import useGlobalShortcuts from "./hooks/useGlobalShortcuts";

import "./App.css";

function App() {
  useGlobalShortcuts();
  const { controller, view: viewState } = useFirebaseState();
  const { sync, auth } = useLocalState();

  const { view } = controller;
  const { vp, background } = viewState;
  const asset = controller.currentAsset || null;

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

  return (
    <div>
      {view === VIEWS.control &&
      (sync ? auth.isLoaded && !auth.isEmpty : true) ? (
        <MatchController />
      ) : null}
      <div className="App" style={style}>
        {renderAppContents()}
      </div>
      {(view === VIEWS.match || view === VIEWS.idle) && <Controller />}
      {asset ? (
        <div className="overlay-container" style={vp.style}>
          <AssetComponent asset={asset.asset} time={asset.time} />
        </div>
      ) : null}
      <StateListener />
    </div>
  );
}

export default App;
