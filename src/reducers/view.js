import { handleActions } from "redux-actions";

import ActionTypes from "../ActionTypes";
import backgroundImage from "../images/background_fade.png";

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

const defaultBackground = "Vikes gradient";
export const BACKGROUNDS = {
  [defaultBackground]: {
    backgroundImage: [
      "repeating-linear-gradient(0deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 20%, rgba(199,0,15, 0.5) 40%, rgba(199,0,15) 100%)",
      "repeating-linear-gradient(90deg,rgba(199,0,15),rgba(199,0,15) 30px,#2D1201 30px,#2D1201 60px)",
    ].join(", "),
  },
  Svart: { backgroundColor: "black" },
  Mynd: { backgroundImage: `url(${backgroundImage})` },
  //Ukraine
  Ukraine: {
    backgroundImage:
      "linear-gradient(180deg, #005BBB 0, #005BBB 50%, #FFD500 50%, #FFD500 100%)",
  },
  //Iceland general
  Iceland: {
    backgroundImage: [
      "repeating-linear-gradient(0deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0) 20%, #1c6fb3 40%, rgb(30 49 115 / 80%) 100%)",
      "repeating-linear-gradient(90deg, #1e3173, #1e3173 100%)",
    ].join(", "),
  },
  Ekkert: {},
};

export const getBackground = (key) =>
  BACKGROUNDS[key] || BACKGROUNDS[defaultBackground];

export const initialState = {
  vp: VPS.outside,
  background: BACKGROUNDS[defaultBackground],
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
  [ActionTypes.setBackground]: {
    next(state, { payload: { background } }) {
      return {
        ...state,
        background,
      };
    },
  },
  [ActionTypes.receiveRemoteData]: {
    next(state, { data, path }) {
      if (path === "view" && data) {
        return {
          ...state,
          ...data,
          // Never overwrite vp
          vp: state.vp,
        };
      }
      return state;
    },
  },
};
export default handleActions(actions, initialState);
