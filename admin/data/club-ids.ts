import plainClubIds from "~/../clock/src/club-ids.js";
import type { MatchListMatchTeam } from "~/models/api-responses";

export const clubIds: MatchListMatchTeam[] = Object.entries(plainClubIds).map(
    ([name, id]) => ({ id, name }),
);
