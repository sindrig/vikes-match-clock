import React, { Component } from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import PropTypes from "prop-types";

import { RingLoader } from "react-spinners";
import axios from "axios";

import apiConfig from "../../../apiConfig";
import controllerActions from "../../../actions/controller";
import matchActions from "../../../actions/match";

class TeamAssetController extends Component {
  static propTypes = {
    setAvailableMatches: PropTypes.func.isRequired,
    updateMatch: PropTypes.func.isRequired,
    selectMatch: PropTypes.func.isRequired,
    listenPrefix: PropTypes.string.isRequired,
    screens: PropTypes.arrayOf(PropTypes.object),
  };

  constructor(props) {
    super(props);
    this.state = {
      error: "",
      loading: false,
      matches: [],
    };
  }

  fetchMatchesOnPitch = async () => {
    const { screens, listenPrefix } = this.props;
    const matching = screens.filter(({ key }) => {
      return key === listenPrefix;
    });
    if (!matching.length) {
      this.setState({ error: "No screen found" });
      return;
    }
    this.setState({ loading: true });

    const options = {
      params: {
        location: matching[0].pitchIds[0],
        action: "get-matches",
      },
    };
    try {
      const {
        data: { matches },
      } = await axios.get(`${apiConfig.gateWayUrl}match-report/v2`, options);
      this.setState({ error: "", matches, loading: false });
    } catch (e) {
      this.setState({ error: e.message });
    }
  };

  selectMatch = async (match) => {
    const { updateMatch, setAvailableMatches } = this.props;
    this.setState({ loading: true });
    const home = match.home;
    const away = match.away;
    updateMatch({
      homeTeam: home.name,
      awayTeam: away.name,
      matchStartTime: match.time,
    });

    const options = {
      params: {
        matchId: match.match_id,
        action: "get-report",
      },
    };
    try {
      const {
        data: { players },
      } = await axios.get(`${apiConfig.gateWayUrl}match-report/v2`, options);
      setAvailableMatches({ [match.match_id]: { players } });
      this.setState({ error: "", loading: false, matches: [] });
    } catch (e) {
      this.setState({ error: e.message });
    }
    return this.setState({ loading: false });
  };

  render() {
    const { matches, error, loading } = this.state;
    if (!matches.length) {
      return (
        <div>
          <RingLoader loading={loading} />
          <div className="control-item stdbuttons">
            <button type="button" onClick={this.fetchMatchesOnPitch}>
              Sækja leiki á velli
            </button>
          </div>
          <span className="error">{error}</span>
        </div>
      );
    }
    return (
      <div>
        <RingLoader loading={loading} />
        <div className="control-item stdbuttons">
          {matches.map((match) => (
            <button
              type="button"
              key={match.match_id}
              onClick={() => this.selectMatch(match)}
            >
              {match.date} {match.time} {match.competition} [{match.home.name} -{" "}
              {match.away.name}]{" "}
            </button>
          ))}
        </div>
      </div>
    );
  }
}

const stateToProps = ({
  match,
  listeners: { screens },
  controller: { availableMatches, selectedMatch },
  remote: { listenPrefix },
}) => ({
  match,
  availableMatches,
  selectedMatch,
  listenPrefix,
  screens,
});

const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      setAvailableMatches: controllerActions.setAvailableMatches,
      updateMatch: matchActions.updateMatch,
      selectMatch: controllerActions.selectMatch,
    },
    dispatch,
  );

export default connect(stateToProps, dispatchToProps)(TeamAssetController);
