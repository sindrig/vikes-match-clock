import { handleActions, Action } from "redux-actions";

import ActionTypes from "../ActionTypes";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workaround for redux-actions computed property names limitation
const AT: any = ActionTypes;
import backgroundImage from "../images/background_fade.png";
import backgroundCLImage from "../images/background_cl.png";
import backgroundELImage from "../images/background_el.png";
import backgroundConfImage1 from "../images/kop-back1.png";
import backgroundConfImage2 from "../images/kop-back2.png";
import backgroundConfImage3 from "../images/kop-back3.png";

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
  Sambandsdeild1: { backgroundImage: `url(${backgroundConfImage1})` },
  Sambandsdeild2: { backgroundImage: `url(${backgroundConfImage2})` },
  Sambandsdeild3: { backgroundImage: `url(${backgroundConfImage3})` },
  Ekkert: {},
  Blackout: {
    backgroundColor: "black",
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- Background object can return any image type
export const getBackground = (key: string) =>
  (BACKGROUNDS as Record<string, any>)[key] || BACKGROUNDS[defaultBackground];

interface ViewState {
  vp: {
    fontSize: string;
    style: {
      height: number;
      width: number;
    };
  };
  background: string;
  idleImage: string;
}

export const initialState: ViewState = {
  vp: {
    fontSize: "100%",
    style: {
      height: 176,
      width: 240,
    },
  },
  background: defaultBackground,
  idleImage: "Víkingur R",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AT is intentionally 'any' due to redux-actions limitations
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
const actions: Record<string, any> = {
  [AT.setViewPort]: {
    next(state: ViewState, { payload: { vp } }: Action<{ vp: ViewState["vp"] }>): ViewState {
      const htmlElement = document.getElementsByTagName("html")[0];
      if (htmlElement) {
        htmlElement.setAttribute("style", `font-size: ${String(vp.fontSize)}`);
      }
      return { ...state, vp };
    },
  },
  [AT.setBackground]: {
    next(state: ViewState, { payload: { background } }: Action<{ background: string }>): ViewState {
      return {
        ...state,
        background,
      };
    },
  },
  [AT.setIdleImage]: {
    next(state: ViewState, { payload: { idleImage } }: Action<{ idleImage: string }>): ViewState {
      return {
        ...state,
        idleImage,
      };
    },
  },
  [AT.receiveRemoteData]: {
    next(state: ViewState, { data, path }: { data: unknown; path: string }): ViewState {
      if (path === "view" && data && typeof data === "object") {
        return {
          ...state,
          ...(data as Partial<ViewState>),
          // Never overwrite vp
          vp: state.vp,
        };
      }
      return state;
    },
  },
};
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
export default handleActions(actions, initialState);
