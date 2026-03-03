import type React from "react";
import { useState } from "react";
import { Nav, Tooltip, Whisper, Button } from "rsuite";
import { RingLoader } from "react-spinners";
import GearIcon from "@rsuite/icons/Gear";
import MediaIcon from "@rsuite/icons/Media";
import TimeIcon from "@rsuite/icons/Time";
import CloseIcon from "@rsuite/icons/CloseOutline";

import { TABS, VIEWS } from "../constants";
import { firebaseAuth } from "../firebaseAuth";
import MatchActions from "./MatchActions";
import MatchActionSettings from "./MatchActionSettings";
import MediaManager from "./media/MediaManager";
import RefreshHandler from "./RefreshHandler";
import AssetController from "./asset/AssetController";
import "rsuite/dist/rsuite.min.css";
import "./Controller.css";
import {
  useController,
  useListeners,
  useView,
} from "../contexts/FirebaseStateContext";
import { useAuth, useLocalState } from "../contexts/LocalStateContext";

const confirmRefresh = () => confirm("Are you absolutely sure?");

const Controller = () => {
  const { controller, selectView, renderAsset } = useController();
  const { view: viewState } = useView();
  const { screens } = useListeners();
  const {
    email,
    setEmail,
    password,
    setPassword,
    listenPrefix,
    setListenPrefix,
    available,
    setScreenViewport,
  } = useLocalState();
  const auth = useAuth();

  const [tab, setTab] = useState<string>(TABS.home);
  const [selectedScreen, setSelectedScreen] = useState("");

  const { view, currentAsset } = controller;
  const { vp } = viewState;

  const isAuthenticated = auth.isLoaded && !auth.isEmpty;

  // State 1: no listenPrefix, not authenticated — screen selector + login form only
  if (!listenPrefix && !isAuthenticated) {
    const login = (e: React.FormEvent) => {
      e.preventDefault();
      firebaseAuth
        .login(email, password)
        .catch((err: Error) => alert(err.message));
    };

    const loginWithGoogle = () => {
      void firebaseAuth.loginWithGoogle().then(() => console.log("logged in"));
    };

    return (
      <div className="controller login-controller">
        <div className="control-item">
          <div>
            Skjár:
            <select
              onChange={({ target: { value } }) => setSelectedScreen(value)}
              value={selectedScreen}
            >
              <option value="" disabled>
                Veldu skjá
              </option>
              {screens.map(({ label, screen }, i) => (
                <option value={String(i)} key={i}>
                  {label} {screen.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const screen = screens[parseInt(selectedScreen, 10)];
                if (screen) {
                  setScreenViewport(screen.screen);
                  setListenPrefix(screen.key);
                }
              }}
              disabled={selectedScreen === ""}
            >
              Birta skjá
            </button>
          </div>
          <form onSubmit={login}>
            <div>
              <input
                name="email"
                autoComplete="email"
                placeholder="E-mail"
                value={email}
                onChange={({ target: { value } }) => setEmail(value)}
              />
              <input
                name="password"
                placeholder="Password"
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={({ target: { value } }) => setPassword(value)}
              />
            </div>
            <div>
              <button type="submit">Login</button>
            </div>
          </form>
          <button type="button" onClick={loginWithGoogle}>
            Login (google)
          </button>
        </div>
      </div>
    );
  }

  if (isAuthenticated && !listenPrefix) {
    return (
      <div className="screen-selector">
        <h2>Veldu skjá til að stjórna</h2>
        {available === null ? (
          <RingLoader color="#1675e0" size={60} />
        ) : available.length === 0 ? (
          <p>Engir skjáir tiltækir</p>
        ) : (
          <div className="screen-selector-buttons">
            {available.map((locationKey) => {
              const locationScreens = screens.filter(
                (s) => s.key === locationKey,
              );
              if (locationScreens.length === 0) return null;

              const first = locationScreens[0];
              if (!first) return null;
              const label = first.label;
              const screenNames = locationScreens
                .map((s) => s.screen.name)
                .join(" / ");
              const buttonLabel = `${label} ${screenNames}`;

              return (
                <button
                  key={locationKey}
                  className="screen-selector-button"
                  onClick={() => setListenPrefix(locationKey)}
                >
                  {buttonLabel}
                </button>
              );
            })}
          </div>
        )}
        <button
          type="button"
          className="screen-selector-logout"
          onClick={() => void firebaseAuth.logout()}
        >
          Útskrá
        </button>
      </div>
    );
  }

  // State 2: listenPrefix set, not authenticated — Controller renders nothing
  // (disconnect button lives in App.tsx)
  if (!isAuthenticated) {
    return null;
  }

  // State 3: authenticated — full UI with local tab state
  const clearState = () => {
    localStorage.clear();
  };

  const showHome = tab === "home";
  const showSettings = tab === "settings";
  const showMedia = tab === "media";
  const tooltipClear = <Tooltip>Birtir aftur stöðu leiksins á skjá.</Tooltip>;
  return (
    <div className="controller">
      <div className="dummyDiv" style={vp.style}></div>
      <Nav appearance="tabs" onSelect={setTab} activeKey={tab}>
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
      {showHome && <MatchActions />}
      {showSettings && <MatchActionSettings />}
      {showMedia && <MediaManager />}
      {currentAsset && (
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
        </div>
      )}
      <AssetController />
    </div>
  );
};

export default Controller;
