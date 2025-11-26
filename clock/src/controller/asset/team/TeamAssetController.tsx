import { Component } from "react";
import type React from "react";
import { connect, ConnectedProps } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";

import { RingLoader } from "react-spinners";
import clubIds from "../../../club-ids";

import Team from "./Team";
import SubView from "./SubView";
import assetTypes from "../AssetTypes";
import MatchSelector from "./MatchSelector";
import controllerActions from "../../../actions/controller";
import { getMOTMAsset, getPlayerAssetObject } from "./assetHelpers";
import { RootState, Player } from "../../../types";

interface SubPlayer extends Player {
  teamName: string;
}

interface TeamAssetControllerState {
  loading: boolean;
  error: string;
  selectSubs: boolean;
  subTeam: string | null;
  subIn: SubPlayer | null;
  subOut: Player | null;
  selectPlayerAsset: boolean;
  selectGoalScorer: boolean;
  selectMOTM: boolean;
  effect: string;
}

interface AssetObject {
  type?: string;
  subIn?: unknown;
  subOut?: unknown;
  key?: string;
  [key: string]: unknown;
}

interface OwnProps {
  addAssets: (assets: AssetObject[], options?: { showNow?: boolean }) => void;
  previousView: () => void;
}

const mapStateToProps = ({
  match,
  controller: { availableMatches, selectedMatch },
  remote: { listenPrefix },
}: RootState) => ({
  match,
  availableMatches,
  selectedMatch,
  listenPrefix,
});

const mapDispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      clearMatchPlayers: controllerActions.clearMatchPlayers,
      getAvailableMatches: controllerActions.getAvailableMatches,
    },
    dispatch
  );

const connector = connect(mapStateToProps, mapDispatchToProps);
type PropsFromRedux = ConnectedProps<typeof connector>;
type TeamAssetControllerProps = PropsFromRedux & OwnProps;

class TeamAssetController extends Component<
  TeamAssetControllerProps,
  TeamAssetControllerState
> {
  constructor(props: TeamAssetControllerProps) {
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
      selectMOTM: false,
      effect: "blink",
    };
    this.autoFill = this.autoFill.bind(this);
    this.addPlayersToQ = this.addPlayersToQ.bind(this);
    this.selectSubs = this.selectSubs.bind(this);
    this.addSubAsset = this.addSubAsset.bind(this);
    this.selectPlayerAsset = this.selectPlayerAsset.bind(this);
    this.selectGoalScorer = this.selectGoalScorer.bind(this);
    this.selectMOTM = this.selectMOTM.bind(this);
  }

  getTeamPlayers(): { homeTeam: Player[]; awayTeam: Player[] } {
    const {
      selectedMatch,
      availableMatches,
      match: { homeTeam, awayTeam },
    } = this.props;
    const match = selectedMatch ? availableMatches[selectedMatch] : undefined;
    const clubIdsMap = clubIds as Record<string, string>;
    const homeTeamId = clubIdsMap[homeTeam];
    const awayTeamId = clubIdsMap[awayTeam];
    return {
      homeTeam: match?.players && homeTeamId ? match.players[homeTeamId] || [] : [],
      awayTeam: match?.players && awayTeamId ? match.players[awayTeamId] || [] : [],
    };
  }

  clearState(): void {
    this.setState({
      error: "",
      selectSubs: false,
      subTeam: null,
      subIn: null,
      subOut: null,
      selectPlayerAsset: false,
      selectGoalScorer: false,
      selectMOTM: false,
    });
  }

  addPlayersToQ(): void {
    const { match, addAssets, previousView, listenPrefix } = this.props;
    const { homeTeam, awayTeam } = this.getTeamPlayers();
    const teamAssets = [
      { team: awayTeam, teamName: match.awayTeam },
      { team: homeTeam, teamName: match.homeTeam },
    ].map(({ team, teamName }) =>
      team
        .filter((p) => p.show)
        .map((player) =>
          getPlayerAssetObject({ player, teamName, listenPrefix })
        )
    );
    const flattened: unknown[] = ([] as unknown[]).concat(...teamAssets);
    if (!flattened.every((i) => i)) {
      this.setState({ error: "Missing name/number for some players to show" });
    } else {
      addAssets(flattened);
      previousView();
    }
  }

  async addSubAsset(): Promise<void> {
    const { subIn, subOut } = this.state;
    const { match, addAssets, listenPrefix } = this.props;
    if (!subIn || !subOut) return;

    const teamName = subIn.teamName === "homeTeam" ? match.homeTeam : match.awayTeam;
    const subInObj = await getPlayerAssetObject({
      player: subIn,
      teamName,
      listenPrefix,
    });
    const subOutObj = await getPlayerAssetObject({
      player: subOut,
      // NOTE: We use subIn teamName
      teamName,
      listenPrefix,
    });
    if (!subInObj || !subOutObj) return;
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
      }
    );
    this.clearState();
  }

  selectSubs(player: Player, teamName: string): void {
    const { subIn } = this.state;
    const asset: Player = {
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

  selectPlayerAsset(player: Player, teamName: string): void {
    const { match, addAssets, listenPrefix } = this.props;
    const actualTeamName = teamName === "homeTeam" ? match.homeTeam : match.awayTeam;
    addAssets(
      [
        getPlayerAssetObject({
          player,
          teamName: actualTeamName,
          listenPrefix,
        }),
      ],
      {
        showNow: true,
      }
    );
    this.clearState();
  }

  selectGoalScorer(player: Player, teamName: string): void {
    const { match, addAssets, listenPrefix } = this.props;
    const actualTeamName = teamName === "homeTeam" ? match.homeTeam : match.awayTeam;
    addAssets(
      [
        getPlayerAssetObject({
          player,
          teamName: actualTeamName,
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
      }
    );
    this.clearState();
  }

  selectMOTM(player: Player, teamName: string): void {
    const { match, addAssets, listenPrefix } = this.props;
    const actualTeamName = teamName === "homeTeam" ? match.homeTeam : match.awayTeam;
    addAssets(
      [getMOTMAsset({ player, teamName: actualTeamName, listenPrefix })],
      {
        showNow: true,
      }
    );
    this.clearState();
  }

  autoFill(): void {
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
      .catch((e: Error) => this.setState({ error: e.message }))
      .then(() => this.setState({ loading: false }));
  }

  renderControls(): React.JSX.Element {
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

  renderActionButtons(): React.JSX.Element {
    const { selectSubs, selectPlayerAsset, selectGoalScorer, selectMOTM } =
      this.state;
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
    if (selectPlayerAsset || selectGoalScorer || selectMOTM) {
      return (
        <button
          type="button"
          onClick={() =>
            this.setState({
              selectPlayerAsset: false,
              selectGoalScorer: false,
              selectMOTM: false,
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
          <button
            type="button"
            onClick={() => this.setState({ selectMOTM: true })}
          >
            Birta mann leiksins
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

  renderActionControllers(): React.JSX.Element {
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
              subTeam={subTeam ? (subTeam === "homeTeam" ? match.homeTeam : match.awayTeam) : null}
            />
          </div>
        ) : null}
      </div>
    );
  }

  renderTeam(teamName: "homeTeam" | "awayTeam"): React.JSX.Element {
    const {
      selectSubs,
      subTeam,
      selectPlayerAsset,
      selectGoalScorer,
      selectMOTM,
    } = this.state;
    let selectPlayerAction:
      | ((player: Player, teamName: string) => void)
      | null = null;
    if (selectSubs) {
      if (!subTeam || subTeam === teamName) {
        selectPlayerAction = this.selectSubs;
      }
    } else if (selectPlayerAsset) {
      selectPlayerAction = this.selectPlayerAsset;
    } else if (selectGoalScorer) {
      selectPlayerAction = this.selectGoalScorer;
    } else if (selectMOTM) {
      selectPlayerAction = this.selectMOTM;
    }
    return <Team teamName={teamName} selectPlayer={selectPlayerAction} />;
  }

  render(): React.JSX.Element {
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

export default connector(TeamAssetController);
