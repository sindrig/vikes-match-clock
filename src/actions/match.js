import { createAction } from "redux-actions";
import ActionTypes from "../ActionTypes";
import { PENALTY_LENGTH } from "../constants";

const uuidv4 = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; // eslint-disable-line
    const v = c == "x" ? r : (r & 0x3) | 0x8; // eslint-disable-line
    return v.toString(16);
  });

const actions = {
  [ActionTypes.updateMatch]: (partial) => partial,
  [ActionTypes.addPenalty]: ({ team, penaltyLength }) => ({
    team,
    key: uuidv4(),
    penaltyLength: penaltyLength || PENALTY_LENGTH,
  }),
  [ActionTypes.removePenalty]: (key) => ({ key }),
  [ActionTypes.addToPenalty]: (key, toAdd) => ({
    key,
    toAdd: toAdd || PENALTY_LENGTH,
  }),
  [ActionTypes.pauseMatch]: (options) => ({
    isHalfEnd: options && options.isHalfEnd,
  }),
  [ActionTypes.startMatch]: () => {},
  [ActionTypes.setHalfStops]: (halfStops) => ({ halfStops }),
  [ActionTypes.updateHalfLength]: (currentValue, newValue) => ({
    currentValue,
    newValue,
  }),
  [ActionTypes.removeTimeout]: () => {},
  [ActionTypes.addGoal]: ({ team }) => ({ team }),
};

Object.keys(actions).forEach((type) => {
  actions[type] = createAction(type, actions[type]);
});

actions.buzz = () => (dispatch) => {
  dispatch({ type: ActionTypes.buzz, payload: { on: true } });
  setTimeout(
    () => dispatch({ type: ActionTypes.buzz, payload: { on: false } }),
    3000
  );
  return true;
};

actions.matchTimeout = ({ team }) => (dispatch) => {
  dispatch(actions.pauseMatch());
  dispatch(actions.buzz());
  dispatch({ type: ActionTypes.matchTimeout, payload: { team } });
};

export default actions;
