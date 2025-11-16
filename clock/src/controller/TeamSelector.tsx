import { connect, ConnectedProps } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";
import clubIds from "../club-ids";

import matchActions from "../actions/match";
import { RootState, Match, TwoMinPenalty } from "../types";

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

const filterOption = (key: string, currentValue: string | number | boolean | TwoMinPenalty[] | undefined) => {
  if (currentValue && typeof currentValue === 'string' && !(clubIds as Record<string, string>)[currentValue]) {
    return normalize(key).startsWith(normalize(currentValue));
  }
  return true;
};

interface OwnProps {
  teamAttrName: keyof Match;
}

const mapStateToProps = ({ match }: RootState) => ({ match });
const mapDispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      updateMatch: matchActions.updateMatch,
    },
    dispatch,
  );

const connector = connect(mapStateToProps, mapDispatchToProps);
type PropsFromRedux = ConnectedProps<typeof connector>;
type TeamSelectorProps = PropsFromRedux & OwnProps;

const TeamSelector = ({ teamAttrName, match, updateMatch }: TeamSelectorProps) => (
  <div>
    <select
      value={(match[teamAttrName] as string) || ""}
      onChange={(event) => updateMatch({ [teamAttrName]: event.target.value })}
    >
      <option value="">Veldu lið...</option>
      {Object.keys(clubIds)
        .filter((key) => filterOption(key, match[teamAttrName] as string))
        .sort((v1, v2) => v1.localeCompare(v2))
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

export default connector(TeamSelector);
