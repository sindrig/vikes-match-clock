import keymirror from "keymirror";
import backgroundImage from "./images/background_fade.png";

export const THUMB_VP = {
  height: 50,
  width: 100,
};

const backgrounds = [
  { backgroundImage: `url(${backgroundImage})` },
  { backgroundColor: "black" },
  {
    backgroundImage: [
      "repeating-linear-gradient(0deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 20%, rgba(199,0,15, 0.5) 40%, rgba(199,0,15) 100%)",
      "repeating-linear-gradient(90deg,rgba(199,0,15),rgba(199,0,15) 30px,#2D1201 30px,#2D1201 60px)",
    ].join(", "),
  },
  {},
  //Ukraine
  {
    backgroundImage:
      "linear-gradient(180deg, #005BBB 0, #005BBB 50%, #FFD500 50%, #FFD500 100%)",
  },
  //Iceland general
  {
    backgroundImage: [
      "repeating-linear-gradient(0deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0) 20%, #1c6fb3 40%, rgb(30 49 115 / 80%) 100%)",
      "repeating-linear-gradient(90deg, #1e3173, #1e3173 100%)",
    ].join(", "),
  },
];

export const BACKGROUND = backgrounds[5];

export const SPORTS = keymirror({
  football: null,
  handball: null,
});

export const HALFSTOPS = {
  [SPORTS.football]: {
    35: [35, 70, 80, 90],
    40: [40, 80, 90, 100],
    45: [45, 90, 105, 120],
  },
  [SPORTS.handball]: {
    15: [15, 30, 33, 36],
    20: [20, 40, 45, 50],
    25: [25, 50, 55, 60],
    30: [30, 60, 65, 70],
  },
};

export const DEFAULT_HALFSTOPS = {
  [SPORTS.football]: HALFSTOPS[SPORTS.football]["45"],
  [SPORTS.handball]: HALFSTOPS[SPORTS.handball]["30"],
};

export const PENALTY_LENGTH = 2 * 60 * 1000;
export const TIMEOUT_LENGTH = 60000;
