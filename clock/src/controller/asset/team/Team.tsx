import { Component } from "react";
import { connect, ConnectedProps } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";
import axios from "axios";
import CloseIcon from "@rsuite/icons/Close";
import ReloadIcon from "@rsuite/icons/Reload";
import { Button, IconButton } from "rsuite";

import controllerActions from "../../../actions/controller";
import TeamPlayer from "./TeamPlayer";
import apiConfig from "../../../apiConfig";
import { Player, RootState } from "../../../types";

import "./Team.css";

interface OwnProps {
  teamName: "homeTeam" | "awayTeam";
  selectPlayer?: ((player: Player, teamName: string) => void) | null;
}

interface TeamState {
  inputValue: string;
  error: string;
  loading: boolean;
}

interface PlayerResponse {
  id?: number;
  name?: string;
  number?: number | string;
  role?: string;
}

const stateToProps = (
  { controller: { availableMatches, selectedMatch }, match }: RootState,
  ownProps: OwnProps,
) => {
  const selectedMatchObj = selectedMatch
    ? availableMatches[selectedMatch]
    : undefined;
  const teamId = match[`${ownProps.teamName}Id`];
  return {
    team: selectedMatchObj?.players
      ? selectedMatchObj.players[String(teamId)] || []
      : [],
    group: selectedMatchObj?.group,
    sex: selectedMatchObj?.sex,
    match,
    teamId,
    selectedMatch,
  };
};

const dispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      editPlayer: controllerActions.editPlayer,
      deletePlayer: controllerActions.deletePlayer,
      addPlayer: controllerActions.addPlayer,
    },
    dispatch,
  );

const connector = connect(stateToProps, dispatchToProps);

type TeamProps = ConnectedProps<typeof connector> & OwnProps;

class Team extends Component<TeamProps, TeamState> {
  state: TeamState = {
    inputValue: "",
    error: "",
    loading: false,
  };

  addEmptyLine = (): void => {
    const { addPlayer, teamId } = this.props;
    addPlayer(String(teamId));
  };

  removePlayer(idx: number): void {
    const { deletePlayer, teamId } = this.props;
    deletePlayer(String(teamId), idx);
  }

  updatePlayer(idx: number): (updatedPlayer: Partial<Player>) => void {
    return (updatedPlayer: Partial<Player>) => {
      const { editPlayer, teamId } = this.props;
      console.log("updatedPlayer", updatedPlayer);
      editPlayer(String(teamId), idx, updatedPlayer);
    };
  }

  fetchPlayerId(idx: number): void {
    const { team, teamId, group, sex } = this.props;
    const player = team[idx];

    if (!player || !player.name) {
      this.setState({ error: "Player not found or has no name" });
      return;
    }

    const options = {
      params: {
        playerName: player.name,
        teamId,
        group,
        sex,
      },
    };
    this.setState({ loading: true });
    axios
      .get<PlayerResponse>(
        `${apiConfig.gateWayUrl}match-report/v2?action=search-for-player`,
        options,
      )
      .then((response) => {
        if (response && response.data && response.data.id) {
          const updatedPlayer: Player = {
            id: response.data.id,
            name: response.data.name || player.name,
            number: response.data.number || player.number,
            role: response.data.role || player.role,
            show: player.show,
          };
          this.updatePlayer(idx)(updatedPlayer);
        } else {
          this.setState({
            error: `No ID found for player ${String(player.name ?? "unknown")}`,
          });
        }
      })
      .catch((e: Error) => {
        this.setState({ error: e.message });
      })
      .finally(() => {
        this.setState({ loading: false });
      });
  }

  submitForm = (event: React.FormEvent<HTMLFormElement>): void => {
    const { team, selectPlayer, teamName } = this.props;
    event.preventDefault();
    const { inputValue } = this.state;
    const requestedNumber = parseInt(inputValue, 10);
    let found = false;
    team.forEach((player) => {
      if (requestedNumber === parseInt(String(player.number || 0), 10)) {
        selectPlayer?.(player, teamName);
        found = true;
      }
    });
    this.setState({
      error: found ? "" : `No player #${inputValue} found`,
      inputValue: "",
    });
  };

  renderForm(): React.JSX.Element {
    const { inputValue } = this.state;
    return (
      <form onSubmit={this.submitForm}>
        <input
          type="text"
          value={inputValue}
          onChange={({ target: { value } }) =>
            this.setState({ inputValue: value })
          }
          placeholder="# leikmanns og ENTER"
          className="player-input"
        />
      </form>
    );
  }

  render(): React.JSX.Element {
    const { team, selectPlayer, teamName, match, selectedMatch } = this.props;
    const { error, loading } = this.state;
    return (
      <div
        className="team-asset-container"
        style={loading ? { backgroundColor: "grey" } : {}}
      >
        <span>{error}</span>
        {selectPlayer ? this.renderForm() : null}
        <div className="team-name">{match[teamName]}</div>
        {match[teamName]
          ? team.map((p, i) => (
              <div className="player-whole-line" key={String(i)}>
                {selectPlayer && p.name ? (
                  <Button
                    appearance="default"
                    onClick={() => selectPlayer(p, teamName)}
                  >{`#${String(p.number ?? (p.role ? p.role[0] : ""))} - ${String(p.name ?? "")}`}</Button>
                ) : (
                  <TeamPlayer player={p} onChange={this.updatePlayer(i)} />
                )}
                {!selectPlayer && !p.id && (
                  <IconButton
                    icon={<ReloadIcon />}
                    size="xs"
                    color="blue"
                    appearance="primary"
                    circle
                    onClick={() => this.fetchPlayerId(i)}
                  />
                )}
                {!selectPlayer && (
                  <IconButton
                    icon={<CloseIcon />}
                    size="xs"
                    color="red"
                    appearance="primary"
                    circle
                    onClick={() => this.removePlayer(i)}
                  />
                )}
              </div>
            ))
          : null}
        {match[teamName] && selectedMatch ? (
          <div>
            <button type="button" onClick={this.addEmptyLine}>
              Ný lína...
            </button>
          </div>
        ) : null}
      </div>
    );
  }
}

export default connector(Team);
