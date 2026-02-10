import React from "react";
import { useController } from "../../../contexts/FirebaseStateContext";

const MatchSelector = (): React.JSX.Element => {
  const {
    controller: { availableMatches, selectedMatch },
    selectMatch,
  } = useController();

  return (
    <div className="control-item">
      <select
        value={selectedMatch || ""}
        onChange={({ target: { value } }) => selectMatch(value)}
      >
        {Object.keys(availableMatches).map((matchKey) => (
          <option value={matchKey} key={matchKey}>
            {availableMatches[matchKey]?.group || matchKey}
          </option>
        ))}
      </select>
    </div>
  );
};

export default MatchSelector;
