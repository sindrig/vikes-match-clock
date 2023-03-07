import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";

import viewActions from "./actions/view";
import Controller from "./controller/Controller";
import Asset from "./controller/asset/Asset";

import ScoreBoard from "./screens/ScoreBoard";
import Idle from "./screens/Idle";

import { VIEWS } from "./reducers/controller";
import { getBackground } from "./reducers/view";
import { viewPortPropType } from "./propTypes";
import StateListener from "./StateListener";
import MatchController from "./match-controller/MatchController";

import "./App.css";

class App extends Component {
  static propTypes = {
    view: PropTypes.string.isRequired,
    background: PropTypes.string.isRequired,
    vp: viewPortPropType.isRequired,
    asset: PropTypes.shape({
      asset: PropTypes.shape({
        key: PropTypes.string.isRequired,
        type: PropTypes.string.isRequired,
      }).isRequired,
      time: PropTypes.number,
    }),
    setViewPort: PropTypes.func.isRequired,
    auth: PropTypes.shape({
      isLoaded: PropTypes.bool,
      isEmpty: PropTypes.bool,
    }).isRequired,
    sync: PropTypes.bool,
  };

  static defaultProps = {
    asset: null,
    sync: false,
  };

  static childContextTypes = {
    // eslint-disable-next-line
    shortcuts: PropTypes.object.isRequired,
  };

  componentDidMount() {
    const { setViewPort, vp } = this.props;
    setViewPort(vp);
  }

  renderAppContents() {
    const { view } = this.props;
    switch (view) {
      case VIEWS.match:
      case VIEWS.control:
        return <ScoreBoard />;
      case VIEWS.idle:
      default:
        return <Idle />;
    }
  }

  renderCurrentView() {
    const { view, sync, auth, vp, background, asset } = this.props;
    const style = {
      ...getBackground(background),
      ...vp.style,
    };
    return (
      <React.Fragment>
        {view === VIEWS.control &&
        (sync ? auth.isLoaded && !auth.isEmpty : true) ? (
          <MatchController />
        ) : null}
        <div className="App" style={style}>
          {this.renderAppContents()}
        </div>
        {(view === VIEWS.match || view === VIEWS.idle) && <Controller />}
        {asset ? (
          <div className="overlay-container" style={vp.style}>
            <Asset {...asset} />
          </div>
        ) : null}
      </React.Fragment>
    );
  }

  render() {
    return (
      <div>
        {this.renderCurrentView()}
        <StateListener />
      </div>
    );
  }
}

const stateToProps = ({
  controller: { view, currentAsset },
  view: { vp, background },
  remote: { sync },
  firebase,
}) => ({
  view,
  vp,
  background,
  asset: currentAsset || null,
  sync,
  auth: firebase.auth,
});

const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      setViewPort: viewActions.setViewPort,
    },
    dispatch
  );

export default connect(stateToProps, dispatchToProps)(App);
