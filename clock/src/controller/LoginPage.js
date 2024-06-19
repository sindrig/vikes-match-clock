import React, { Component } from "react";
import PropTypes from "prop-types";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";
import { withFirebase } from "react-redux-firebase";
import remoteActions from "../actions/remote";
import viewActions from "../actions/view";
import { viewPortPropType } from "../propTypes";

class LoginPage extends Component {
  static propTypes = {
    password: PropTypes.string,
    sync: PropTypes.bool,
    email: PropTypes.string,
    setSync: PropTypes.func.isRequired,
    setEmail: PropTypes.func.isRequired,
    setPassword: PropTypes.func.isRequired,
    firebase: PropTypes.shape({
      auth: PropTypes.func.isRequired,
      login: PropTypes.func.isRequired,
      logout: PropTypes.func.isRequired,
    }).isRequired,
    available: PropTypes.arrayOf(PropTypes.string),
    screens: PropTypes.arrayOf(PropTypes.object),
    listenPrefix: PropTypes.string.isRequired,
    setListenPrefix: PropTypes.func.isRequired,
    auth: PropTypes.shape({
      isLoaded: PropTypes.bool,
      isEmpty: PropTypes.bool,
      email: PropTypes.string,
    }).isRequired,
    setViewPort: PropTypes.func.isRequired,
    vp: viewPortPropType.isRequired,
  };

  static defaultProps = {
    password: "",
    email: "",
    sync: false,
    available: [],
  };

  renderIsRemoteCtrl() {
    const { sync, setSync } = this.props;
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
  }

  renderListenerCtrl() {
    const {
      setListenPrefix,
      setViewPort,
      available,
      listenPrefix,
      auth,
      screens,
      vp,
    } = this.props;
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
        .map((screen, i) => [screen, i])
        .filter(([{ screen, key }]) => {
          return (
            key === listenPrefix &&
            screen.style.height === vp.style.height &&
            screen.style.width === vp.style.width
          );
        });
      const currentScreenId = matching.length ? matching[0][1] : 0;
      return (
        <div>
          Skjár:
          <select
            onChange={({ target: { value } }) => {
              const screen = screens[value];
              setListenPrefix(screen.key);
              setViewPort(screen.screen);
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
  }

  render() {
    const {
      password,
      email,
      setEmail,
      setPassword,
      setListenPrefix,
      listenPrefix,
      firebase,
      auth,
    } = this.props;
    if (auth.isLoaded && !auth.isEmpty) {
      return (
        <div>
          {this.renderListenerCtrl()}
          {this.renderIsRemoteCtrl()}[<b>{auth.email}</b>][
          {listenPrefix}]
          <br />
          <button type="button" onClick={() => firebase.logout()}>
            Log out...
          </button>
        </div>
      );
    }
    const login = (e) => {
      e.preventDefault();
      // eslint-disable-next-line
      firebase
        .login({ email, password })
        .then(() => setListenPrefix(email.split("@")[0]))
        .catch((err) => alert(err.message));
    };
    const loginWithGoogle = () => {
      firebase
        .login({
          provider: "google",
          type: "popup",
        })
        .then(() => console.log("logged in"));
    };
    return (
      <div>
        <form onSubmit={login}>
          <div>{this.renderIsRemoteCtrl()}</div>
          {this.renderListenerCtrl()}
          <div>
            <input
              name="email"
              autoComplete="email"
              placeholder="E-mail"
              label="Email"
              value={email}
              onChange={({ target: { value } }) => setEmail(value)}
            />
            <input
              name="password"
              placeholder="Password"
              autoComplete="current-password"
              label="Password"
              type="password"
              value={password}
              onChange={({ target: { value } }) => setPassword(value)}
            />
          </div>
          <div>
            <button type="submit">Login</button>
          </div>
        </form>
        <button onClick={loginWithGoogle}>Login (google)</button>
      </div>
    );
  }
}

const stateToProps = ({
  remote: { email, password, sync, listenPrefix },
  listeners: { available, screens },
  firebase,
  view: { vp },
}) => ({
  email,
  password,
  sync,
  listenPrefix,
  available,
  screens,
  vp,
  auth: firebase.auth,
});
const dispatchToProps = (dispatch) =>
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

export default withFirebase(connect(stateToProps, dispatchToProps)(LoginPage));
