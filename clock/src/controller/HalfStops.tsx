import React from "react";
import { HALFSTOPS } from "../constants";
import { InjuryTimeDisplayMode } from "../types";
import { useMatch } from "../contexts/FirebaseStateContext";

const DISPLAY_MODES: { value: InjuryTimeDisplayMode; label: string }[] = [
  { value: "stop", label: "Stoppa við lok" },
  { value: "full", label: "Mínútur og sekúndur" },
  { value: "minutes", label: "Aðeins mínútur" },
];

const HalfStops = () => {
  const { match, updateHalfLength, setHalfStops } = useMatch();
  const { halfStops, matchType, injuryTimeDisplayMode } = match;

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
                setHalfStops(stops, injuryTimeDisplayMode);
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
            onChange={({ target: { value } }) => updateHalfLength(s, value)}
            key={i}
            className="halfstops-input"
          />
        ))}
      </div>
      <label>
        Uppbótartími{" "}
        <select
          value={injuryTimeDisplayMode}
          onChange={({ target: { value } }) =>
            setHalfStops(halfStops, value as InjuryTimeDisplayMode)
          }
        >
          {DISPLAY_MODES.map(({ value: mode, label }) => (
            <option value={mode} key={mode}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </React.Fragment>
  );
};

export default HalfStops;
