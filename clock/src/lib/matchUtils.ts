import type {
  LineupsResponse,
  MatchAndTeamOfficial,
  TeamLineup,
  TeamPlayer,
} from "../api/client";
import type { ListenersState, Player, Roster } from "../types";

export const getTeamId = (
  screens: ListenersState["screens"],
  listenPrefix: string,
): number => {
  const screen = screens.find((s: { key?: string }) => s.key === listenPrefix);
  return screen?.teamId ?? 2492;
};

function mapRole(tp: TeamPlayer): string {
  if (tp.goalkeeper && tp.startingLineup) return "Markmaður";
  if (tp.goalkeeper && !tp.startingLineup) return "Varamarkmaður";
  if (tp.captain) return "Fyrirliði";
  if (tp.startingLineup && !tp.goalkeeper) return "Leikmaður";
  return "Varamáður";
}

export function transformSingleLineup(lineup: TeamLineup): Player[] {
  const players: Player[] = (lineup.players ?? []).map((tp) => {
    const player: Player = {
      name: tp.person.name,
      id: tp.person.id,
      role: mapRole(tp),
      show: tp.startingLineup ?? false,
    };
    if (tp.shirtNumber != null) {
      player.number = tp.shirtNumber;
    }
    return player;
  });

  const officials: Player[] = (lineup.officials ?? []).map(
    (official: MatchAndTeamOfficial) => ({
      name: official.person.name,
      id: official.person.id,
      role: "Þjálfari",
      show: false,
    }),
  );

  return [...players, ...officials];
}

export function transformLineups(lineups: LineupsResponse): Roster {
  return {
    home: transformSingleLineup(lineups.home),
    away: transformSingleLineup(lineups.away),
  };
}
