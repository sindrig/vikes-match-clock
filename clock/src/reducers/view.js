import { handleActions } from "redux-actions";

import ActionTypes from "../ActionTypes";
import backgroundImage from "../images/background_fade.png";
import backgroundCLImage from "../images/background_cl.png";
import backgroundELImage from "../images/background_el.png";

const defaultBackground = "Vikes 2024";
export const BACKGROUNDS = {
  [defaultBackground]: {
    backgroundImage:
      "repeating-linear-gradient(90deg, #2D1201, #2D1201 20px, rgba(199,0,15) 20px, rgba(199,0,15) 25px)",
  },
  ["Vikes 2024 - option 2"]: {
    backgroundImage:
      "repeating-linear-gradient(90deg, rgb(0,0,0), rgb(0,0,0) 20px, rgba(199,0,15) 20px, rgba(199,0,15) 23px)",
  },
  ["Vikes 2024 - option 3"]: {
    backgroundImage:
      "repeating-linear-gradient(90deg, rgb(0,0,0), rgb(0,0,0) 20px, rgba(170,0,12) 20px, rgba(170,0,12) 23px)",
  },

  ["Vikes 2024 - option 4"]: {
    backgroundImage:
      "repeating-linear-gradient(90deg, rgb(0,0,0), rgb(0,0,0) 20px, rgba(120,0,10) 20px, rgba(120,0,10) 23px)",
  },

  ["Vikes gradient"]: {
    backgroundImage: [
      "repeating-linear-gradient(0deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 20%, rgba(199,0,15, 0.5) 40%, rgba(199,0,15) 100%)",
      "repeating-linear-gradient(90deg,rgba(199,0,15),rgba(199,0,15) 30px,#2D1201 30px,#2D1201 60px)",
    ].join(", "),
  },
  Svart: { backgroundColor: "black" },
  // ["IBV 2024"]: {
  //   backgroundImage:
  //     "repeating-linear-gradient(90deg, rgba(0,0,0), rgba(0,0,0) 20px, rgb(255,255,255) 20px, rgba(255,255,255) 23px)",
  // },
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
  //CL
  CL: { backgroundImage: `url(${backgroundCLImage})` },
  EuropaLeague: { backgroundImage: `url(${backgroundELImage})` },
  Ekkert: {},
};

export const getBackground = (key) =>
  BACKGROUNDS[key] || BACKGROUNDS[defaultBackground];

export const initialState = {
  vp: {
    key: "outside",
    fontSize: "100%",
    name: "Skjár",
    height: 176,
    width: 240,
  },
  background: BACKGROUNDS[defaultBackground],
  idleImage: "Víkingur R",
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
  [ActionTypes.setIdleImage]: {
    next(state, { payload: { idleImage } }) {
      return {
        ...state,
        idleImage,
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
