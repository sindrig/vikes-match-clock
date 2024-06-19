import React, { Component } from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import PropTypes from "prop-types";

import { RingLoader } from "react-spinners";
import { matchPropType, availableMatchesPropType } from "../../../propTypes";
import clubIds from "../../../club-ids";

import Team from "./Team";
import SubView from "./SubView";
import assetTypes from "../AssetTypes";
import MatchSelector from "./MatchSelector";
import controllerActions from "../../../actions/controller";
import { getPlayerAssetObject } from "./assetHelpers";

class TeamAssetController extends Component {
  static propTypes = {
    addAssets: PropTypes.func.isRequired,
    match: matchPropType.isRequired,
    previousView: PropTypes.func.isRequired,
    selectedMatch: PropTypes.number,
    availableMatches: availableMatchesPropType,
    getAvailableMatches: PropTypes.func.isRequired,
    clearMatchPlayers: PropTypes.func.isRequired,
    listenPrefix: PropTypes.string.isRequired,
  };

  static defaultProps = {
    availableMatches: {},
    selectedMatch: null,
  };

  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      error: "",
      selectSubs: false,
      subTeam: null,
      subIn: null,
      subOut: null,
      selectPlayerAsset: false,
      selectGoalScorer: false,
      effect: "blink",
    };
    this.autoFill = this.autoFill.bind(this);
    this.addPlayersToQ = this.addPlayersToQ.bind(this);
    this.selectSubs = this.selectSubs.bind(this);
    this.addSubAsset = this.addSubAsset.bind(this);
    this.selectPlayerAsset = this.selectPlayerAsset.bind(this);
    this.selectGoalScorer = this.selectGoalScorer.bind(this);
  }

  getTeamPlayers() {
    const {
      selectedMatch,
      availableMatches,
      match: { homeTeam, awayTeam },
    } = this.props;
    const match = availableMatches[selectedMatch];
    return {
      homeTeam: match?.players ? match.players[clubIds[homeTeam]] || [] : [],
      awayTeam: match?.players ? match.players[clubIds[awayTeam]] || [] : [],
    };
  }

  clearState() {
    this.setState({
      error: "",
      selectSubs: false,
      subTeam: null,
      subIn: null,
      subOut: null,
      selectPlayerAsset: false,
      selectGoalScorer: false,
    });
  }

  addPlayersToQ() {
    const { match, addAssets, previousView, listenPrefix } = this.props;
    const { homeTeam, awayTeam } = this.getTeamPlayers();
    const teamAssets = [
      { team: awayTeam, teamName: match.awayTeam },
      { team: homeTeam, teamName: match.homeTeam },
    ].map(({ team, teamName }) =>
      team
        .filter((p) => p.show)
        .map((player) =>
          getPlayerAssetObject({ player, teamName, listenPrefix }),
        ),
    );
    const flattened = [].concat(...teamAssets);
    if (!flattened.every((i) => i)) {
      this.setState({ error: "Missing name/number for some players to show" });
    } else {
      addAssets(flattened);
      previousView();
    }
  }

  async addSubAsset() {
    const { subIn, subOut } = this.state;
    const { match, addAssets, listenPrefix } = this.props;
    const subInObj = await getPlayerAssetObject({
      player: subIn,
      teamName: match[subIn.teamName],
      listenPrefix,
    });
    const subOutObj = await getPlayerAssetObject({
      player: subOut,
      // NOTE: We use subIn teamName
      teamName: match[subIn.teamName],
      listenPrefix,
    });
    addAssets(
      [
        {
          type: assetTypes.SUB,
          subIn: subInObj,
          subOut: subOutObj,
          key: `sub-${subInObj.key}-${subOutObj.key}`,
        },
      ],
      {
        showNow: true,
      },
    );
    this.clearState();
  }

  selectSubs(player, teamName) {
    const { subIn } = this.state;
    const asset = {
      ...player,
      name: player.name
        .split(" ")
        .slice(0, player.name.split(" ").length - 1)
        .join(" "),
    };
    if (subIn) {
      this.setState({ subOut: asset }, this.addSubAsset);
    } else {
      this.setState({
        subIn: { teamName, ...asset },
        subTeam: teamName,
      });
    }
  }

  selectPlayerAsset(player, teamName) {
    const { match, addAssets, listenPrefix } = this.props;
    addAssets(
      [
        getPlayerAssetObject({
          player,
          teamName: match[teamName],
          listenPrefix,
        }),
      ],
      {
        showNow: true,
      },
    );
    this.clearState();
  }

  selectGoalScorer(player, teamName) {
    const { match, addAssets, listenPrefix } = this.props;
    addAssets(
      [
        getPlayerAssetObject({
          player,
          teamName: match[teamName],
          overlay: {
            text: "",
            blink: true,
            effect: this.state.effect,
          },
          listenPrefix,
        }),
      ],
      {
        showNow: true,
      },
    );
    this.clearState();
  }

  autoFill() {
    const {
      match: { homeTeam, awayTeam },
      getAvailableMatches,
    } = this.props;
    if (!homeTeam || !awayTeam) {
      this.setState({ error: "Choose teams first" });
      return;
    }
    this.setState({ loading: true });
    getAvailableMatches(homeTeam, awayTeam)
      .then(() => this.setState({ error: "" }))
      .catch((e) => this.setState({ error: e.message }))
      .then(() => this.setState({ loading: false }));
  }

  renderControls() {
    const { availableMatches, clearMatchPlayers } = this.props;
    const { homeTeam, awayTeam } = this.getTeamPlayers();
    return (
      <div>
        {!(homeTeam.length || awayTeam.length) ? (
          <div className="control-item stdbuttons">
            <button type="button" onClick={this.autoFill}>
              Sækja lið
            </button>
          </div>
        ) : null}
        {homeTeam.length ||
        awayTeam.length ||
        Object.keys(availableMatches).length ? (
          <div className="control-item stdbuttons">
            <button
              type="button"
              onClick={() =>
                window.confirm("Ertu alveg viss?") && clearMatchPlayers()
              }
            >
              Hreinsa lið
            </button>
          </div>
        ) : null}
        {homeTeam.length || awayTeam.length ? (
          <div className="control-item stdbuttons">
            <button type="button" onClick={this.addPlayersToQ}>
              Setja lið í biðröð
            </button>
          </div>
        ) : null}
        {availableMatches && Object.keys(availableMatches || {}).length > 1 ? (
          <MatchSelector />
        ) : null}
        {homeTeam.length || awayTeam.length
          ? this.renderActionControllers()
          : null}
      </div>
    );
  }

  renderActionButtons() {
    const { selectSubs, selectPlayerAsset, selectGoalScorer } = this.state;
    if (selectSubs) {
      return (
        <button
          type="button"
          onClick={() =>
            this.setState({
              selectSubs: false,
              subIn: null,
              subOut: null,
              subTeam: null,
            })
          }
        >
          Hætta við skiptingu
        </button>
      );
    }
    if (selectPlayerAsset) {
      return (
        <button
          type="button"
          onClick={() =>
            this.setState({
              selectPlayerAsset: false,
            })
          }
        >
          Hætta við birtingu
        </button>
      );
    }
    if (selectGoalScorer) {
      return (
        <button
          type="button"
          onClick={() =>
            this.setState({
              selectGoalScorer: false,
            })
          }
        >
          Hætta við birtingu
        </button>
      );
    }
    return (
      <div>
        <div className="control-item stdbuttons">
          <button
            type="button"
            onClick={() => this.setState({ selectSubs: true })}
          >
            Skipting
          </button>
        </div>
        <div className="control-item stdbuttons">
          <button
            type="button"
            onClick={() => this.setState({ selectPlayerAsset: true })}
          >
            Birta leikmann
          </button>
        </div>
        <div className="control-item stdbuttons">
          <button
            type="button"
            onClick={() => this.setState({ selectGoalScorer: true })}
          >
            Birta markaskorara
          </button>
        </div>
        <div className="control-item stdbuttons">
          <select
            onChange={({ target: { value } }) =>
              this.setState({ effect: value })
            }
            value={this.state.effect}
          >
            <option value="blink" key="Blink">
              Blink
            </option>
            <option value="shaker" key="Shaker">
              Shaker
            </option>
            <option value="scaleit" key="Scale Up">
              Scale Up
            </option>
          </select>
        </div>
      </div>
    );
  }

  renderActionControllers() {
    const { subIn, subOut, selectSubs, subTeam } = this.state;
    const { match } = this.props;
    return (
      <div className="sub-controller control-item stdbuttons">
        {this.renderActionButtons()}
        {selectSubs ? (
          <div className="control-item">
            <SubView
              subIn={subIn}
              subOut={subOut}
              addSubAsset={this.addSubAsset}
              subTeam={subTeam ? match[subTeam] : null}
            />
          </div>
        ) : null}
      </div>
    );
  }

  renderTeam(teamName) {
    const { selectSubs, subTeam, selectPlayerAsset, selectGoalScorer } =
      this.state;
    let selectPlayerAction = null;
    if (selectSubs) {
      if (!subTeam || subTeam === teamName) {
        selectPlayerAction = this.selectSubs;
      }
    } else if (selectPlayerAsset) {
      selectPlayerAction = this.selectPlayerAsset;
    } else if (selectGoalScorer) {
      selectPlayerAction = this.selectGoalScorer;
    }
    return <Team teamName={teamName} selectPlayer={selectPlayerAction} />;
  }

  render() {
    const { loading, error } = this.state;
    const { match } = this.props;
    if (!match.homeTeam || !match.awayTeam) {
      return <div>Veldu lið fyrst</div>;
    }
    return (
      <div className="team-asset-controller">
        <RingLoader loading={loading} />
        {!loading && this.renderControls()}
        <span className="error">{error}</span>
        <div className="team-asset-controller">
          {this.renderTeam("homeTeam")}
          {this.renderTeam("awayTeam")}
        </div>
      </div>
    );
  }
}

const stateToProps = ({
  match,
  controller: { availableMatches, selectedMatch },
  remote: { listenPrefix },
}) => ({
  match,
  availableMatches,
  selectedMatch,
  listenPrefix,
});

const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      clearMatchPlayers: controllerActions.clearMatchPlayers,
      getAvailableMatches: controllerActions.getAvailableMatches,
    },
    dispatch,
  );

export default connect(stateToProps, dispatchToProps)(TeamAssetController);
