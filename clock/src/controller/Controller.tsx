import type React from "react";
import { useState } from "react";
import { Nav, Tooltip, Whisper, Button, Modal, IconButton } from "rsuite";
import GearIcon from "@rsuite/icons/Gear";
import MediaIcon from "@rsuite/icons/Media";
import ListIcon from "@rsuite/icons/List";
import PeoplesIcon from "@rsuite/icons/Peoples";
import CloseIcon from "@rsuite/icons/CloseOutline";

import { TABS, ASSET_VIEWS } from "../constants";
import { firebaseAuth } from "../firebaseAuth";
import MatchActionSettings from "./MatchActionSettings";
import MediaManager from "./media/MediaManager";
import LoginPage from "./LoginPage";
import RefreshHandler from "./RefreshHandler";
import AssetController from "./asset/AssetController";
import "rsuite/dist/rsuite.min.css";
import "./Controller.css";
import { useController, useListeners } from "../contexts/FirebaseStateContext";
import { useAuth, useLocalState } from "../contexts/LocalStateContext";

const confirmRefresh = () => confirm("Are you absolutely sure?");

const Controller = () => {
  const { controller, renderAsset, selectAssetView } = useController();
  const { screens } = useListeners();
  const {
    email,
    setEmail,
    password,
    setPassword,
    listenPrefix,
    setListenPrefix,
    setScreenViewport,
  } = useLocalState();
  const auth = useAuth();

  const [tab, setTab] = useState<string>(TABS.queue);
  const [selectedScreen, setSelectedScreen] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { currentAsset } = controller;

  const isAuthenticated = auth.isLoaded && !auth.isEmpty;

  // State 1: no listenPrefix, not authenticated — screen selector + login form only
  if (!listenPrefix && !isAuthenticated) {
    const login = (e: React.FormEvent) => {
      e.preventDefault();
      firebaseAuth
        .login(email, password)
        .then(() => {
          if (email) {
            setListenPrefix(email.split("@")[0] || "");
          }
        })
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

  // State 2: listenPrefix set, not authenticated — Controller renders nothing
  // (disconnect button lives in App.tsx)
  if (!isAuthenticated) {
    return null;
  }

  // State 3: authenticated — full UI with local tab state
  const clearState = () => {
    localStorage.clear();
  };

  const handleTabSelect = (key: string) => {
    setTab(key);
    if (key === TABS.queue) {
      selectAssetView(ASSET_VIEWS.assets);
    } else if (key === TABS.teams) {
      selectAssetView(ASSET_VIEWS.teams);
    }
  };

  const tooltipClear = <Tooltip>Birtir aftur stöðu leiksins á skjá.</Tooltip>;
  return (
    <div className="controller">
      {currentAsset && (
        <div className="control-item clear-overlay">
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
      <div className="nav-bar">
        <Nav appearance="tabs" onSelect={handleTabSelect} activeKey={tab}>
          <Nav.Item eventKey={TABS.queue} icon={<ListIcon />}>
            Biðröð
          </Nav.Item>
          <Nav.Item eventKey={TABS.teams} icon={<PeoplesIcon />}>
            Lið
          </Nav.Item>
          <Nav.Item eventKey={TABS.media} icon={<MediaIcon />}>
            Myndefni
          </Nav.Item>
        </Nav>
        <IconButton
          icon={<GearIcon />}
          appearance="subtle"
          size="sm"
          onClick={() => setSettingsOpen(true)}
          aria-label="Stillingar"
        >
          Stillingar
        </IconButton>
      </div>
      {tab === TABS.media && <MediaManager />}
      {(tab === TABS.queue || tab === TABS.teams) && <AssetController />}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <Modal.Header>
          <Modal.Title>Stillingar</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <MatchActionSettings />
          <div className="page-actions control-item withborder">
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
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default Controller;
