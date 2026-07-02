import clubIds from "../club-ids";

import { Match, TwoMinPenalty } from "../types";
import { useClubOverrides, useMatch } from "../contexts/FirebaseStateContext";

const normalize = (string: string) =>
  string
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const noCaseSensMatch = (value: string) => {
  const foundLogo = Object.keys(clubIds).filter(
    (logo) => normalize(logo) === normalize(value),
  );
  if (foundLogo.length > 0) {
    return foundLogo[0];
  }
  return value;
};

const filterOption = (
  key: string,
  currentValue: string | number | boolean | TwoMinPenalty[] | undefined,
) => {
  if (
    currentValue &&
    typeof currentValue === "string" &&
    !(clubIds as Record<string, string>)[currentValue]
  ) {
    return normalize(key).startsWith(normalize(currentValue));
  }
  return true;
};

interface TeamSelectorProps {
  teamAttrName: keyof Match;
}

const TeamSelector = ({ teamAttrName }: TeamSelectorProps) => {
  const { match, updateMatch } = useMatch();
  const { clubOverrides } = useClubOverrides();

  const teamOptions = [
    ...new Set([
      ...Object.keys(clubIds),
      ...Object.values(clubOverrides).map((override) => override.name),
    ]),
  ].sort((v1, v2) => v1.localeCompare(v2, "is"));

  return (
    <div>
      <select
        value={(match[teamAttrName] as string) || ""}
        onChange={(event) =>
          updateMatch({ [teamAttrName]: event.target.value })
        }
      >
        <option value="">Veldu lið...</option>
        {teamOptions
          .filter((key) => filterOption(key, match[teamAttrName] as string))
          .map((key) => (
            <option value={key} key={key}>
              {key}
            </option>
          ))}
      </select>
      <input
        id={`team-selector-${String(teamAttrName)}`}
        type="text"
        value={(match[teamAttrName] as string) || ""}
        onChange={({ target: { value } }) =>
          updateMatch({ [teamAttrName]: noCaseSensMatch(value) })
        }
      />
    </div>
  );
};

export default TeamSelector;
