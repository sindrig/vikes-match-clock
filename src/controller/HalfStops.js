import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";

import matchActions from "../actions/match";
import { SPORTS, HALFSTOPS } from "../constants";

const HalfStops = ({
  halfStops,
  updateHalfLength,
  matchType,
  setHalfStops,
}) => {
  const autoHalfStops = HALFSTOPS[matchType] || {};
  return (
    <React.Fragment>
      <div>
        Klukkustopp:
        <select
          onChange={({ target: { value } }) =>
            value && setHalfStops(autoHalfStops[value])
          }
          value=""
        >
          <option value="">Hálfleikstímar...</option>
          {Object.keys(autoHalfStops).map((key) => (
            <option value={key} key={key}>
              {`${key} mín`}
            </option>
          ))}
        </select>
      </div>
      <div>
        {halfStops.map((s, i) => (
          <input
            type="number"
            value={s || ""}
            onChange={({ target: { value } }) => updateHalfLength(s, value)}
            key={i} // eslint-disable-line
            className="halfstops-input"
          />
        ))}
      </div>
    </React.Fragment>
  );
};

HalfStops.propTypes = {
  updateHalfLength: PropTypes.func.isRequired,
  setHalfStops: PropTypes.func.isRequired,
  halfStops: PropTypes.arrayOf(PropTypes.number).isRequired,
  matchType: PropTypes.oneOf(Object.keys(SPORTS)).isRequired,
};

const stateToProps = ({ match: { halfStops, matchType } }) => ({
  halfStops,
  matchType,
});
const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      updateHalfLength: matchActions.updateHalfLength,
      setHalfStops: matchActions.setHalfStops,
    },
    dispatch
  );

export default connect(stateToProps, dispatchToProps)(HalfStops);
