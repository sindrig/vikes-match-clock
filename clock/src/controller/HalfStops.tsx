import React from "react";
import { connect } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";

import matchActions from "../actions/match";
import { Sports, HALFSTOPS } from "../constants";
import { RootState } from "../types";

interface HalfStopsProps {
  halfStops: number[];
  showInjuryTime: boolean;
  updateHalfLength: (currentValue: number, newValue: number) => void;
  matchType: Sports;
  setHalfStops: (halfStops: number[], showInjuryTime: boolean) => void;
}

const HalfStops = ({
  halfStops,
  showInjuryTime,
  updateHalfLength,
  matchType,
  setHalfStops,
}: HalfStopsProps) => {
  const autoHalfStops: Record<number, number[]> = HALFSTOPS[matchType] || {};
  return (
    <React.Fragment>
      <div>
        Klukkustopp:
        <select
          onChange={({ target: { value } }) => {
            if (value) {
              const numericKey = parseInt(value, 10);
              const stops = autoHalfStops[numericKey];
              if (stops) {
                setHalfStops(stops, showInjuryTime);
              }
            }
          }}
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
            onChange={({ target: { value } }) =>
              updateHalfLength(s, parseInt(value, 10))
            }
            key={i}
            className="halfstops-input"
          />
        ))}
      </div>
      <label>
        Sýna uppbótartíma{" "}
        <input
          type="checkbox"
          value="showInjuryTime"
          checked={showInjuryTime || false}
          onChange={() => {
            setHalfStops(halfStops, !showInjuryTime);
          }}
        />
      </label>
    </React.Fragment>
  );
};

const stateToProps = ({ match }: RootState) => ({
  halfStops: match.halfStops,
  matchType: match.matchType,
  showInjuryTime: match.showInjuryTime ?? true,
});

const dispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      updateHalfLength: matchActions.updateHalfLength,
      setHalfStops: matchActions.setHalfStops,
    },
    dispatch,
  );

export default connect(stateToProps, dispatchToProps)(HalfStops);
