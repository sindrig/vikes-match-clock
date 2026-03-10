import type React from "react";
import { useEffect, useState } from "react";
import { Nav, Button, Modal, IconButton } from "rsuite";
import { RingLoader } from "react-spinners";
import GearIcon from "@rsuite/icons/Gear";
import MediaIcon from "@rsuite/icons/Media";
import ListIcon from "@rsuite/icons/List";
import PeoplesIcon from "@rsuite/icons/Peoples";

import { TABS, ASSET_VIEWS } from "../constants";

const assetViewToTab: Record<string, string> = {
  [ASSET_VIEWS.teams]: TABS.teams,
  [ASSET_VIEWS.assets]: TABS.queue,
};
import { firebaseAuth } from "../firebaseAuth";
import MatchActionSettings from "./MatchActionSettings";
import MediaManager from "./media/MediaManager";
import RefreshHandler from "./RefreshHandler";
import AssetController from "./asset/AssetController";
import "rsuite/dist/rsuite.min.css";
import "./Controller.css";
import { useController, useListeners } from "../contexts/FirebaseStateContext";
import { useAuth, useLocalState } from "../contexts/LocalStateContext";

const confirmRefresh = () => confirm("Are you absolutely sure?");

const Controller = () => {
  const { controller, selectAssetView } = useController();
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

  const [tab, setTab] = useState<string>(
    assetViewToTab[controller.assetView] ?? TABS.queue,
  );

  useEffect(() => {
    const mapped = assetViewToTab[controller.assetView];
    if (mapped) setTab((prev) => (prev === TABS.media ? prev : mapped));
  }, [controller.assetView]);

  const [selectedScreen, setSelectedScreen] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

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
      <div className="initial-screen">
        <div className="initial-screen-card">
          <h3 className="initial-screen-card-title">Skjár</h3>
          <p className="initial-screen-card-desc">
            Veldu skjá til að birta stigatöflu
          </p>
          {screens.length === 0 ? (
            <p className="initial-screen-empty">Engir skjáir tiltækir</p>
          ) : (
            <div className="initial-screen-select-group">
              <select
                className="initial-screen-select"
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
              <Button
                appearance="primary"
                size="md"
                onClick={() => {
                  const screen = screens[parseInt(selectedScreen, 10)];
                  if (screen) {
                    setScreenViewport(screen.screen);
                    setListenPrefix(screen.key);
                  }
                }}
                disabled={selectedScreen === ""}
                block
              >
                Birta skjá
              </Button>
            </div>
          )}
        </div>

        <div className="initial-screen-divider">
          <span>eða</span>
        </div>

        <div className="initial-screen-card">
          <h3 className="initial-screen-card-title">Stjórnborð</h3>
          <p className="initial-screen-card-desc">
            Skráðu þig inn til að stjórna leik
          </p>
          <form className="initial-screen-form" onSubmit={login}>
            <input
              className="initial-screen-input"
              name="email"
              autoComplete="email"
              placeholder="E-mail"
              value={email}
              onChange={({ target: { value } }) => setEmail(value)}
            />
            <input
              className="initial-screen-input"
              name="password"
              placeholder="Lykilorð"
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={({ target: { value } }) => setPassword(value)}
            />
            <Button appearance="primary" size="md" type="submit" block>
              Innskrá
            </Button>
          </form>
          <Button appearance="ghost" size="sm" onClick={loginWithGoogle} block>
            Innskrá með Google
          </Button>
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

  const handleTabSelect = (key: string) => {
    setTab(key);
    if (key === TABS.queue) {
      selectAssetView(ASSET_VIEWS.assets);
    } else if (key === TABS.teams) {
      selectAssetView(ASSET_VIEWS.teams);
    }
  };

  return (
    <div className="controller">
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
          </div>
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default Controller;
