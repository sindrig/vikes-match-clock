import type React from "react";
import { bindActionCreators, Dispatch } from "redux";
import { connect } from "react-redux";
import remoteActions from "../actions/remote";
import viewActions from "../actions/view";
import { firebaseAuth } from "../firebaseAuth";
import { RootState, ViewPort, FirebaseAuthState } from "../types";

interface Screen {
  screen: ViewPort;
  label: string;
  key: string;
}

interface LoginPageProps {
  password?: string;
  sync: boolean;
  email?: string;
  setSync: (sync: boolean) => void;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  available?: string[];
  screens?: Screen[];
  listenPrefix: string;
  setListenPrefix: (prefix: string) => void;
  auth: FirebaseAuthState;
  setViewPort: (vp: ViewPort) => void;
  vp: ViewPort;
}

const LoginPage = ({
  password = "",
  sync,
  email = "",
  setSync,
  setEmail,
  setPassword,
  available = [],
  screens = [],
  listenPrefix,
  setListenPrefix,
  auth,
  setViewPort,
  vp,
}: LoginPageProps) => {
  const renderIsRemoteCtrl = () => {
    return (
      <label htmlFor="set-synced">
        <input
          type="checkbox"
          checked={sync}
          onChange={() => setSync(!sync)}
          id="set-synced"
        />
        Fjarstjórn
      </label>
    );
  };

  const renderListenerCtrl = () => {
    if (!available) {
      return null;
    }
    if (auth.isLoaded && !auth.isEmpty) {
      return (
        <div>
          Stjórnandi:
          <select
            onChange={({ target: { value } }) => setListenPrefix(value)}
            value={listenPrefix}
          >
            {available.map((a) => (
              <option value={a} key={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      );
    } else {
      const matching = screens
        .map((screen, i): [Screen, number] => [screen, i])
        .filter(([{ screen: screenVp, key }]) => {
          return (
            key === listenPrefix &&
            screenVp.style.height === vp.style.height &&
            screenVp.style.width === vp.style.width
          );
        });
      const currentScreenId = matching.length ? matching[0]?.[1] : 0;
      return (
        <div>
          Skjár:
          <select
            onChange={({ target: { value } }) => {
              const screen = screens[parseInt(value, 10)];
              if (screen) {
                setListenPrefix(screen.key);
                setViewPort(screen.screen);
              }
            }}
            value={currentScreenId}
          >
            {screens.map(({ screen, label }, i) => (
              <option value={i} key={i}>
                {label} {screen.name}
              </option>
            ))}
          </select>
        </div>
      );
    }
  };

  if (auth.isLoaded && !auth.isEmpty) {
    return (
      <div>
        {renderListenerCtrl()}
        {renderIsRemoteCtrl()}[<b>{auth.email}</b>][{listenPrefix}]
        <br />
        <button
          type="button"
          onClick={() => {
            void firebaseAuth.logout();
          }}
        >
          Log out...
        </button>
      </div>
    );
  }

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
    void firebaseAuth
      .loginWithGoogle()
      .then(() => console.log("logged in"));
  };
  return (
    <div>
      <form onSubmit={login}>
        <div>{renderIsRemoteCtrl()}</div>
        {renderListenerCtrl()}
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
  );
};

const stateToProps = ({
  remote: { email, password, sync, listenPrefix },
  listeners: { available, screens },
  auth,
  view: { vp },
}: RootState) => ({
  email,
  password,
  sync,
  listenPrefix,
  available,
  screens,
  vp,
  auth,
});

const dispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      setEmail: remoteActions.setEmail,
      setPassword: remoteActions.setPassword,
      setSync: remoteActions.setSync,
      setListenPrefix: remoteActions.setListenPrefix,
      setViewPort: viewActions.setViewPort,
    },
    dispatch,
  );

export default connect(stateToProps, dispatchToProps)(LoginPage);
