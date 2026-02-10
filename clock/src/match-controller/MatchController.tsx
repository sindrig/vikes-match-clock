import React from "react";
import { useMatch, useController } from "../contexts/FirebaseStateContext";
import { VIEWS } from "../reducers/controller";

import TeamController from "./TeamController";
import ControlButton from "./ControlButton";

import "./MatchController.css";

const MatchController: React.FC = () => {
  const {
    match: { started, timeout },
    pauseMatch,
    startMatch,
  } = useMatch();
  const { selectView } = useController();

  return (
    <div className="match-controller">
      <TeamController team="home" started={started} />
      <div className="match-controller-box">
        <ControlButton
          className="yellow"
          big
          onClick={() => (started ? pauseMatch() : startMatch())}
          disabled={!!timeout}
        >
          {started ? "Stop" : "Start"}
        </ControlButton>
        <ControlButton onClick={() => selectView(VIEWS.match)}>
          Leiðrétta
        </ControlButton>
      </div>
      <TeamController team="away" started={started} />
    </div>
  );
};

export default MatchController;
