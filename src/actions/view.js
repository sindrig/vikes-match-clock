import { createAction } from "redux-actions";
import ActionTypes from "../ActionTypes";

const actions = {
  [ActionTypes.setViewPort]: (vp) => ({ vp }),
  [ActionTypes.setBackground]: (background) => ({ background }),
};

Object.keys(actions).forEach((type) => {
  actions[type] = createAction(type, actions[type]);
});

export default actions;
