import { handleActions } from "redux-actions";

import ActionTypes from "../ActionTypes";

export const VPS = {
  outside: {
    style: {
      height: 176,
      width: 240,
    },
    key: "outside",
    fontSize: "100%",
    name: "Klukka úti",
  },
  insidebig: {
    style: {
      height: 288,
      width: 448,
    },
    key: "insidebig",
    fontSize: "180%",
    name: "Inni stór",
  },
  insidesmall: {
    style: {
      height: 224,
      width: 288,
    },
    key: "insidesmall",
    fontSize: "130%",
    name: "Inni lítil",
  },
};

export const initialState = {
  vp: VPS.outside,
};

const actions = {
  [ActionTypes.setViewPort]: {
    next(state, { payload: { vp } }) {
      document
        .getElementsByTagName("html")[0]
        .setAttribute("style", `font-size: ${vp.fontSize}`);
      return { ...state, vp };
    },
  },
};
export default handleActions(actions, initialState);
