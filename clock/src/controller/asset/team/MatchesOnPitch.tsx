import { Component } from "react";
import type React from "react";
import { connect, ConnectedProps } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";
import axios from "axios";
import { RingLoader } from "react-spinners";

import apiConfig from "../../../apiConfig";
import controllerActions from "../../../actions/controller";
import matchActions from "../../../actions/match";
import { RootState, Player } from "../../../types";

interface MatchesOnPitchState {
  error: string;
  loading: boolean;
  matches: MatchData[];
}

interface MatchData {
  match_id: string;
  date: string;
  time: string;
  competition: string;
  home: {
    name: string;
  };
  away: {
    name: string;
  };
}

interface MatchReportResponse {
  players: Record<string, Player[]>;
  group?: string;
  sex?: string;
}

interface MatchesResponse {
  matches: MatchData[];
}

const stateToProps = ({
  match,
  listeners: { screens },
  controller: { availableMatches, selectedMatch },
  remote: { listenPrefix },
}: RootState) => ({
  match,
  availableMatches,
  selectedMatch,
  listenPrefix,
  screens,
});

const dispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      setAvailableMatches: controllerActions.setAvailableMatches,
      updateMatch: matchActions.updateMatch,
      selectMatch: controllerActions.selectMatch,
    },
    dispatch,
  );

const connector = connect(stateToProps, dispatchToProps);

type TeamAssetControllerProps = ConnectedProps<typeof connector>;

class TeamAssetController extends Component<
  TeamAssetControllerProps,
  MatchesOnPitchState
> {
  constructor(props: TeamAssetControllerProps) {
    super(props);
    this.state = {
      error: "",
      loading: false,
      matches: [],
    };
  }

  fetchMatchesOnPitch = async (): Promise<void> => {
    const { screens, listenPrefix } = this.props;
    const matching = screens.filter(({ key }) => {
      return key === listenPrefix;
    });
    if (!matching.length) {
      this.setState({ error: "No screen found" });
      return;
    }
    this.setState({ loading: true });

    const firstMatch = matching[0];
    const options = {
      params: {
        location: firstMatch?.pitchIds?.[0],
        action: "get-matches",
      },
    };
    try {
      const {
        data: { matches },
      } = await axios.get<MatchesResponse>(`${apiConfig.gateWayUrl}match-report/v2`, options);
      this.setState({ error: "", matches, loading: false });
    } catch (e) {
      const error = e as Error;
      this.setState({ error: error.message });
    }
  };

  fetchMatchReport = async (): Promise<void> => {
    const { setAvailableMatches } = this.props;
    const matchId = prompt("ID á leikskýrslu");
    if (!matchId) return;

    this.setState({ loading: true });

    const options = {
      params: {
        matchId,
        action: "get-report",
      },
    };
    try {
      const { data } = await axios.get<MatchReportResponse>(
        `${apiConfig.gateWayUrl}match-report/v2`,
        options,
      );
      setAvailableMatches({
        [matchId]: {
          players: data.players,
          group: data.group,
          sex: data.sex,
        },
      });
      this.setState({ error: "", loading: false, matches: [] });
    } catch (e) {
      const error = e as Error;
      this.setState({ error: error.message });
    }
    return this.setState({ loading: false });
  };

  selectMatch = async (match: MatchData): Promise<void> => {
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
      const { data } = await axios.get<MatchReportResponse>(
        `${apiConfig.gateWayUrl}match-report/v2`,
        options,
      );
      setAvailableMatches({
        [match.match_id]: {
          players: data.players,
          group: data.group,
          sex: data.sex,
        },
      });
      this.setState({ error: "", loading: false, matches: [] });
    } catch (e) {
      const error = e as Error;
      this.setState({ error: error.message });
    }
    return this.setState({ loading: false });
  };

  render(): React.JSX.Element {
    const { matches, error, loading } = this.state;
    if (!matches.length) {
      return (
        <div>
          <RingLoader loading={loading} />
          <div className="control-item stdbuttons">
            <button
              type="button"
              onClick={() => {
                void this.fetchMatchesOnPitch();
              }}
            >
              Sækja leiki á velli
            </button>
            <button
              type="button"
              onClick={() => {
                void this.fetchMatchReport();
              }}
            >
              Slá inn ID leikskýrslu
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
              onClick={() => {
                void this.selectMatch(match);
              }}
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

export default connector(TeamAssetController);
