import React from "react";
import { HALFSTOPS } from "../constants";
import { useMatch } from "../contexts/FirebaseStateContext";

const HalfStops = () => {
  const { match, updateHalfLength, setHalfStops } = useMatch();
  const { halfStops, matchType, showInjuryTime } = match;

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
                setHalfStops(stops, showInjuryTime || false);
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
              updateHalfLength(String(s), value)
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

export default HalfStops;
