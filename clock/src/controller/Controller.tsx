import { connect } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";

import controllerActions from "../actions/controller";
import viewActions from "../actions/view";
import globalActions from "../actions/global";
import { Nav } from "rsuite";
import GearIcon from "@rsuite/icons/Gear";
import MediaIcon from "@rsuite/icons/Media";
import TimeIcon from "@rsuite/icons/Time";
import CloseIcon from "@rsuite/icons/CloseOutline";
import Button from "rsuite/Button";
import { Tooltip, Whisper } from "rsuite";

import { TABS, VIEWS } from "../reducers/controller";
import MatchActions from "./MatchActions";
import MatchActionSettings from "./MatchActionSettings";
import MediaManager from "./media/MediaManager";
import LoginPage from "./LoginPage";
import RefreshHandler from "./RefreshHandler";
import AssetController from "./asset/AssetController";
import "rsuite/dist/rsuite.min.css";
import "./Controller.css";
import AssetQueue from "./asset/AssetQueue";
import { RootState, ViewPort, CurrentAsset, FirebaseAuthState, Asset } from "../types";

// eslint-disable-next-line
const confirmRefresh = () => confirm("Are you absolutely sure?");

interface ControllerProps {
  selectView: (view: string) => void;
  selectTab: (tab: string) => void;
  renderAsset: (asset: Asset | null) => void;
  currentAsset: CurrentAsset | null;
  clearState: () => void;
  view: string;
  vp: ViewPort;
  sync: boolean;
  auth: FirebaseAuthState;
  tab: string;
}

const Controller = ({
  selectView,
  selectTab,
  renderAsset,
  currentAsset,
  clearState,
  view,
  vp,
  sync,
  auth,
  tab,
}: ControllerProps) => {
  const showControls = !sync || !auth.isEmpty;
  const showHome = tab === "home";
  // If not logged in, only show the settings tab
  const showSettings = tab === "settings" || !showControls;
  const showMedia = tab === "media";
  const tooltipClear = <Tooltip>Birtir aftur stöðu leiksins á skjá.</Tooltip>;
  return (
    <div className="controller">
      <div className="dummyDiv" style={vp.style}></div>
      <Nav
        appearance="tabs"
        onSelect={selectTab}
        activeKey={showControls ? tab : "settings"}
      >
        <Nav.Item eventKey="home" icon={<TimeIcon />}>
          Heim
        </Nav.Item>
        <Nav.Item eventKey="media" icon={<MediaIcon />}>
          Myndefni
        </Nav.Item>
        <Nav.Item eventKey="settings" icon={<GearIcon />}>
          Stillingar
        </Nav.Item>
      </Nav>
      {showControls && showHome && <MatchActions />}
      {showControls && showSettings && <MatchActionSettings />}
      {showControls && showMedia && <MediaManager />}
      {showControls && currentAsset && (
        <div className="control-item">
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
            >
              <CloseIcon /> Hreinsa virkt overlay
            </Button>
          </Whisper>
        </div>
      )}
      {showSettings && (
        <div className="page-actions control-item withborder">
          {showControls && (
            <div className="view-selector">
              {Object.keys(VIEWS).map((VIEW) => (
                <label htmlFor={`view-selector-${VIEW}`} key={VIEW}>
                  <input
                    type="radio"
                    value={VIEW}
                    checked={VIEW === view}
                    onChange={(e) => selectView(e.target.value)}
                    className="view-selector-input"
                    id={`view-selector-${VIEW}`}
                    name="view-selector"
                  />
                  {VIEW}
                </label>
              ))}
            </div>
          )}
          <Button
            color="red"
            appearance="primary"
            size="sm"
            onClick={() => {
              if (confirmRefresh()) {
                clearState();
                window.location.reload();
              }
            }}
          >
            Hard refresh
          </Button>
          <RefreshHandler />
          <LoginPage />
        </div>
      )}
      {(showControls && <AssetController />) || <AssetQueue />}
    </div>
  );
};

const stateToProps = ({
  controller: { view, currentAsset, tab },
  view: { vp },
  remote: { sync },
  firebase: { auth },
}: RootState) => ({
  view,
  vp,
  sync,
  currentAsset: currentAsset || null,
  auth,
  tab: tab || TABS.home,
});

const dispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      selectView: controllerActions.selectView,
      selectTab: controllerActions.selectTab,
      clearState: globalActions.clearState,
      renderAsset: controllerActions.renderAsset,
      setViewPort: viewActions.setViewPort,
    },
    dispatch,
  );

export default connect(stateToProps, dispatchToProps)(Controller);
