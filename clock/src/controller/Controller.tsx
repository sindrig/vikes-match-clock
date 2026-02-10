import { Nav, Tooltip, Whisper, Button } from "rsuite";
import GearIcon from "@rsuite/icons/Gear";
import MediaIcon from "@rsuite/icons/Media";
import TimeIcon from "@rsuite/icons/Time";
import CloseIcon from "@rsuite/icons/CloseOutline";

import { TABS, VIEWS } from "../constants";
import MatchActions from "./MatchActions";
import MatchActionSettings from "./MatchActionSettings";
import MediaManager from "./media/MediaManager";
import LoginPage from "./LoginPage";
import RefreshHandler from "./RefreshHandler";
import AssetController from "./asset/AssetController";
import "rsuite/dist/rsuite.min.css";
import "./Controller.css";
import AssetQueue from "./asset/AssetQueue";
import { useController, useView } from "../contexts/FirebaseStateContext";
import { useAuth, useRemoteSettings } from "../contexts/LocalStateContext";

const confirmRefresh = () => confirm("Are you absolutely sure?");

const Controller = () => {
  const { controller, selectView, selectTab, renderAsset } = useController();
  const { view: viewState } = useView();
  const { sync } = useRemoteSettings();
  const auth = useAuth();

  const { view, currentAsset, tab } = controller;
  const { vp } = viewState;

  const clearState = () => {
    localStorage.clear();
  };

  const showControls = !sync || !auth.isEmpty;
  const showHome = (tab || TABS.home) === "home";
  // If not logged in, only show the settings tab
  const showSettings = (tab || TABS.home) === "settings" || !showControls;
  const showMedia = tab === "media";
  const tooltipClear = <Tooltip>Birtir aftur stöðu leiksins á skjá.</Tooltip>;
  return (
    <div className="controller">
      <div className="dummyDiv" style={vp.style}></div>
      <Nav
        appearance="tabs"
        onSelect={selectTab}
        activeKey={showControls ? tab || TABS.home : "settings"}
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

export default Controller;
