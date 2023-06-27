import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";

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
import { VPS } from "../reducers/view";
import MatchActions from "./MatchActions";
import MatchActionSettings from "./MatchActionSettings";
import MediaManager from "./media/MediaManager";
import LoginPage from "./LoginPage";
import RefreshHandler from "./RefreshHandler";
import AssetController from "./asset/AssetController";
import { viewPortPropType } from "../propTypes";
import "rsuite/dist/rsuite.min.css";
import "./Controller.css";

// eslint-disable-next-line
const confirmRefresh = () => confirm("Are you absolutely sure?");

const Controller = ({
  selectView,
  selectTab,
  renderAsset,
  currentAsset,
  clearState,
  view,
  vp,
  setViewPort,
  sync,
  auth,
  tab,
}) => {
  const currentViewPortName = Object.keys(VPS).filter(
    (key) =>
      VPS[key].style.height === vp.style.height &&
      VPS[key].style.width === vp.style.width
  )[0];
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
              onClick={() => renderAsset(0)}
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
                    checked={VIEW === view ? "checked" : false}
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
          <div className="viewport-select">
            <select
              value={currentViewPortName}
              onChange={(e) =>
                VPS[e.target.value] && setViewPort(VPS[e.target.value])
              }
            >
              {Object.keys(VPS).map((VP) => (
                <option value={VP} key={VP}>
                  {VPS[VP].name}
                </option>
              ))}
            </select>
          </div>
          <Button
            color="red"
            appearance="primary"
            size="sm"
            onClick={() =>
              confirmRefresh() &&
              clearState().then(() => window.location.reload())
            }
          >
            Hard refresh
          </Button>
          <RefreshHandler />
          <LoginPage />
        </div>
      )}
      {showControls && <AssetController />}
    </div>
  );
};

Controller.propTypes = {
  clearState: PropTypes.func.isRequired,
  selectView: PropTypes.func.isRequired,
  renderAsset: PropTypes.func.isRequired,
  setViewPort: PropTypes.func.isRequired,
  view: PropTypes.string.isRequired,
  vp: viewPortPropType.isRequired,
  sync: PropTypes.bool,
  firebase: PropTypes.shape({
    auth: PropTypes.func.isRequired,
  }),
  currentAsset: PropTypes.shape({
    asset: PropTypes.shape({
      key: PropTypes.string.isRequired,
      type: PropTypes.string.isRequired,
    }).isRequired,
    time: PropTypes.number,
  }),
  auth: PropTypes.shape({
    isEmpty: PropTypes.bool,
  }).isRequired,
  selectTab: PropTypes.func.isRequired,
  tab: PropTypes.string.isRequired,
};

Controller.defaultProps = {
  sync: false,
  firebase: null,
  currentAsset: null,
  tab: TABS.home,
};

const stateToProps = ({
  controller: { view, currentAsset, tab },
  view: { vp },
  remote: { sync },
  firebase: { auth },
}) => ({
  view,
  vp,
  sync,
  currentAsset: currentAsset || null,
  auth,
  tab: tab,
});

const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      selectView: controllerActions.selectView,
      selectTab: controllerActions.selectTab,
      clearState: globalActions.clearState,
      renderAsset: controllerActions.renderAsset,
      setViewPort: viewActions.setViewPort,
    },
    dispatch
  );

export default connect(stateToProps, dispatchToProps)(Controller);
