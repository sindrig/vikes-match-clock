import { createAction } from "redux-actions";
import ActionTypes from "../ActionTypes";

const actions = {
  [ActionTypes.setEmail]: (email) => ({ email }),
  [ActionTypes.setPassword]: (password) => ({ password }),
  [ActionTypes.setSync]: (sync) => ({ sync }),
  [ActionTypes.setListenPrefix]: (listenPrefix) => ({ listenPrefix }),
};

Object.keys(actions).forEach((type) => {
  actions[type] = createAction(type, actions[type]);
});

export default actions;
