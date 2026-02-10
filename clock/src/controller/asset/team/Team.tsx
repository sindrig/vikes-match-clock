import { Component, createRef } from "react";
import { connect, ConnectedProps } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";
import axios from "axios";
import CloseIcon from "@rsuite/icons/Close";
import ReloadIcon from "@rsuite/icons/Reload";
import ImageIcon from "@rsuite/icons/Image";
import { Button, IconButton } from "rsuite";

import controllerActions from "../../../actions/controller";
import TeamPlayer from "./TeamPlayer";
import LineupConfirmModal, { ConfirmedPlayer } from "./LineupConfirmModal";
import apiConfig from "../../../apiConfig";
import { auth } from "../../../firebase";
import { firebaseDatabase } from "../../../firebaseDatabase";
import { Player, RootState, ClubRosterPlayer } from "../../../types";

import "./Team.css";

interface OwnProps {
  teamName: "homeTeam" | "awayTeam";
  selectPlayer?: ((player: Player, teamName: string) => void) | null;
}

export interface ParsedPlayer {
  name: string;
  number: number | null;
}

interface TeamState {
  inputValue: string;
  error: string;
  loading: boolean;
  scanLoading: boolean;
  parsedLineup: ParsedPlayer[] | null;
}

interface PlayerResponse {
  id?: number;
  name?: string;
  number?: number | string;
  role?: string;
}

const mapStateToProps = (
  {
    controller: { availableMatches, selectedMatch, rosters },
    match,
  }: RootState,
  ownProps: OwnProps,
) => {
  const selectedMatchObj = selectedMatch
    ? availableMatches[selectedMatch]
    : undefined;
  const teamId = match[`${ownProps.teamName}Id`];
  const clubRoster = rosters[String(teamId)]?.playersById ?? {};
  return {
    team: selectedMatchObj?.players
      ? selectedMatchObj.players[String(teamId)] || []
      : [],
    group: selectedMatchObj?.group,
    sex: selectedMatchObj?.sex,
    match,
    teamId,
    selectedMatch,
    clubRoster,
  };
};

const mapDispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      editPlayer: controllerActions.editPlayer,
      deletePlayer: controllerActions.deletePlayer,
      addPlayer: controllerActions.addPlayer,
      setAvailableMatches: controllerActions.setAvailableMatches,
      updateClubRosterPlayer: controllerActions.updateClubRosterPlayer,
    },
    dispatch,
  );

const connector = connect(mapStateToProps, mapDispatchToProps);

type TeamProps = ConnectedProps<typeof connector> & OwnProps;

class Team extends Component<TeamProps, TeamState> {
  fileInputRef = createRef<HTMLInputElement>();

  state: TeamState = {
    inputValue: "",
    error: "",
    loading: false,
    scanLoading: false,
    parsedLineup: null,
  };

  handleScanClick = () => {
    this.fileInputRef.current?.click();
  };

  handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      this.setState({ error: "Mynd er of stór (max 10MB)" });
      if (this.fileInputRef.current) {
        this.fileInputRef.current.value = "";
      }
      return;
    }

    this.setState({ scanLoading: true, error: "" });

    void (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error("Not authenticated");

        const reader = new FileReader();

        reader.onerror = () => {
          console.error("FileReader error:", reader.error);
          this.setState({
            error: "Villa við að lesa mynd",
            scanLoading: false,
          });
          if (this.fileInputRef.current) {
            this.fileInputRef.current.value = "";
          }
        };

        reader.onload = (e) => {
          const dataUrl = e.target?.result;
          if (typeof dataUrl !== "string") {
            this.setState({
              error: "Villa við að lesa mynd",
              scanLoading: false,
            });
            return;
          }
          const base64String = dataUrl.split(",")[1];

          axios
            .post<{ players: ParsedPlayer[] }>(
              `${apiConfig.gateWayUrl}parse-lineup`,
              {
                image: base64String,
                mimeType: file.type,
              },
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              },
            )
            .then((response) => {
              this.setState({ parsedLineup: response.data.players });
            })
            .catch((err: unknown) => {
              console.error("Error parsing lineup:", err);
              this.setState({ error: "Villa við að greina mynd" });
            })
            .finally(() => {
              this.setState({ scanLoading: false });
              if (this.fileInputRef.current) {
                this.fileInputRef.current.value = "";
              }
            });
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error("Error preparing upload:", err);
        this.setState({
          error: "Villa við að undirbúa mynd",
          scanLoading: false,
        });
      }
    })();
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

  handleConfirmLineup = (confirmedPlayers: ConfirmedPlayer[]) => {
    const { addPlayer, editPlayer, teamId, updateClubRosterPlayer } =
      this.props;

    const startIdx = this.props.team.length;

    confirmedPlayers.forEach((player, i) => {
      addPlayer(String(teamId));

      const newPlayer: Player = {
        name: player.ksiName || player.parsedName,
        number: player.ksiNumber || player.parsedNumber || 0,
        id: player.ksiId || undefined,
        show: true,
        role: "",
      };

      editPlayer(String(teamId), startIdx + i, newPlayer);

      if (player.ksiId && player.ksiName) {
        const ksiIdStr = String(player.ksiId);
        const rosterPlayer: ClubRosterPlayer = {
          name: player.ksiName,
          number: player.ksiNumber || undefined,
          updatedAt: Date.now(),
        };

        updateClubRosterPlayer(String(teamId), ksiIdStr, rosterPlayer);

        firebaseDatabase
          .set(`rosters/${teamId}/playersById/${ksiIdStr}`, rosterPlayer)
          .catch((err: unknown) =>
            console.error("Failed to save roster player:", err),
          );
      }
    });

    this.setState({ parsedLineup: null });
  };

  handleCancelLineup = () => {
    this.setState({ parsedLineup: null });
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
        {this.state.parsedLineup && (
          <LineupConfirmModal
            parsedLineup={this.state.parsedLineup}
            teamId={this.props.teamId}
            group={this.props.group}
            sex={this.props.sex}
            clubRoster={this.props.clubRoster}
            onConfirm={this.handleConfirmLineup}
            onCancel={this.handleCancelLineup}
          />
        )}
        {selectPlayer ? this.renderForm() : null}
        <div className="team-name">
          {match[teamName]}
          {!selectPlayer && selectedMatch && auth.currentUser && (
            <>
              <input
                type="file"
                accept="image/*"
                ref={this.fileInputRef}
                style={{ display: "none" }}
                onChange={this.handleFileSelect}
              />
              <IconButton
                icon={<ImageIcon />}
                appearance="ghost"
                size="xs"
                loading={this.state.scanLoading}
                onClick={this.handleScanClick}
                style={{ marginLeft: 8 }}
              >
                Skanna skýrslu
              </IconButton>
            </>
          )}
        </div>
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
