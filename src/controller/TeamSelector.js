import React from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import PropTypes from "prop-types";
import { matchPropType } from "../propTypes";
import clubLogos from "../images/clubLogos";

import matchActions from "../actions/match";

const normalize = (string) =>
  string
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const noCaseSensMatch = (value) => {
  const foundLogo = Object.keys(clubLogos).filter(
    (logo) => normalize(logo) === normalize(value),
  );
  if (foundLogo.length > 0) {
    return foundLogo[0];
  }
  return value;
};

const filterOption = (key, currentValue) => {
  if (currentValue && !clubLogos[currentValue]) {
    return normalize(key).startsWith(normalize(currentValue));
  }
  return true;
};

const TeamSelector = ({ teamAttrName, match, updateMatch }) => (
  <div>
    <select
      value={match[teamAttrName] || ""}
      onChange={(event) => updateMatch({ [teamAttrName]: event.target.value })}
    >
      <option value="">Veldu lið...</option>
      {Object.keys(clubLogos)
        .filter((key) => filterOption(key, match[teamAttrName]))
        .map((key) => (
          <option value={key} key={key}>
            {key}
          </option>
        ))}
    </select>
    <input
      id={`team-selector-${teamAttrName}`}
      type="text"
      value={match[teamAttrName] || ""}
      onChange={({ target: { value } }) =>
        updateMatch({ [teamAttrName]: noCaseSensMatch(value) })
      }
    />
  </div>
);

TeamSelector.propTypes = {
  teamAttrName: PropTypes.string.isRequired,
  match: matchPropType.isRequired,
  updateMatch: PropTypes.func.isRequired,
};

const stateToProps = ({ match }, ownProps) => ({ match, ...ownProps });
const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      updateMatch: matchActions.updateMatch,
    },
    dispatch,
  );

export default connect(stateToProps, dispatchToProps)(TeamSelector);
