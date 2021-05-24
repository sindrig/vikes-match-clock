import React, { Component } from "react";
import PropTypes from "prop-types";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";
import { withFirebase } from "react-redux-firebase";
import remoteActions from "../actions/remote";

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
    }).isRequired,
    available: PropTypes.arrayOf(PropTypes.string),
    listenPrefix: PropTypes.string.isRequired,
    setListenPrefix: PropTypes.func.isRequired,
    auth: PropTypes.shape({
      isLoaded: PropTypes.bool,
      isEmpty: PropTypes.bool,
    }).isRequired,
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
    const { setListenPrefix, available, listenPrefix } = this.props;
    if (!available) {
      return null;
    }
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
          {this.renderIsRemoteCtrl()}[<b>{auth.email.split("@")[0]}</b>][
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
        .then((data) => setListenPrefix(email.split("@")[0]))
        .catch((err) => alert(err.message));
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
      </div>
    );
  }
}

const stateToProps = ({
  remote: { email, password, sync, listenPrefix },
  listeners: { available },
  firebase,
}) => ({
  email,
  password,
  sync,
  listenPrefix,
  available,
  auth: firebase.auth,
});
const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      setEmail: remoteActions.setEmail,
      setPassword: remoteActions.setPassword,
      setSync: remoteActions.setSync,
      setListenPrefix: remoteActions.setListenPrefix,
    },
    dispatch
  );

export default withFirebase(connect(stateToProps, dispatchToProps)(LoginPage));
