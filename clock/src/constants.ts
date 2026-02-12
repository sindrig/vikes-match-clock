import keymirror from "keymirror";

import backgroundImage from "./images/background_fade.png";
import backgroundCLImage from "./images/background_cl.png";
import backgroundELImage from "./images/background_el.png";
import backgroundConfImage1 from "./images/kop-back1.png";
import backgroundConfImage2 from "./images/kop-back2.png";
import backgroundConfImage3 from "./images/kop-back3.png";

export const THUMB_VP = {
  height: 50,
  width: 100,
} as const;

export enum Sports {
  Football = "football",
  Handball = "handball",
}

// Controller constants
export const ASSET_VIEWS = keymirror({
  assets: null,
  teams: null,
});

export const VIEWS = keymirror({
  idle: null,
  match: null,
  control: null,
});

export const TABS = keymirror({
  home: null,
  settings: null,
});

// View/Background constants
const defaultBackground = "Vikes 2024";

export interface BackgroundStyle {
  backgroundImage?: string;
  backgroundColor?: string;
}

export const BACKGROUNDS: Record<string, BackgroundStyle> = {
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
  Mynd: { backgroundImage: `url(${backgroundImage})` },
  Ukraine: {
    backgroundImage:
      "linear-gradient(180deg, #005BBB 0, #005BBB 50%, #FFD500 50%, #FFD500 100%)",
  },
  Iceland: {
    backgroundImage: [
      "repeating-linear-gradient(0deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0) 20%, #1c6fb3 40%, rgb(30 49 115 / 80%) 100%)",
      "repeating-linear-gradient(90deg, #1e3173, #1e3173 100%)",
    ].join(", "),
  },
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

export const getBackground = (key: string): BackgroundStyle =>
  BACKGROUNDS[key] ?? BACKGROUNDS[defaultBackground]!;

export const DEFAULT_BACKGROUND = defaultBackground;

export const HALFSTOPS: Record<Sports, Record<number, number[]>> = {
  [Sports.Football]: {
    35: [35, 70, 80, 90],
    40: [40, 80, 90, 100],
    45: [45, 90, 105, 120],
  },
  [Sports.Handball]: {
    15: [15, 30, 33, 36],
    20: [20, 40, 45, 50],
    25: [25, 50, 55, 60],
    30: [30, 60, 65, 70],
  },
};

export const DEFAULT_HALFSTOPS: Record<Sports, number[]> = {
  [Sports.Football]: HALFSTOPS[Sports.Football][45] as number[],
  [Sports.Handball]: HALFSTOPS[Sports.Handball][30] as number[],
};

export const PENALTY_LENGTH = 2 * 60 * 1000;
export const TIMEOUT_LENGTH = 60000;
