import keymirror from "keymirror";

export const THUMB_VP = {
  height: 50,
  width: 100,
};

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
