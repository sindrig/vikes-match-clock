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
  queue: null,
  teams: null,
  media: null,
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

// Theme system
import type { ThemeConfig } from "./types";

export const DEFAULT_THEME: ThemeConfig = {
  // Score boxes
  scoreBoxBg: "black",
  scoreBoxColor: "white",
  scoreBoxBorder: "1px solid white",
  scoreBoxFontSize: "2.5rem",
  scoreBoxFontFamily: '"Anton", sans-serif',
  scoreBoxStroke: "none",

  // Clock box
  clockBg: "black",
  clockColor: "white",
  clockBorder: "1px solid white",
  clockFontSizeMin: "1.7rem",
  clockFontSizeMax: "1.85rem",
  clockFontFamily: '"Anton", sans-serif',
  clockStroke: "none",

  // Clock position
  clockTop: "45.5%",
  clockLeft: "33.5%",
  clockWidth: "33%",
  clockHeight: "23%",

  // Score position
  scoreTop: "57%",
  scoreHeight: "34%",
  scoreWidth: "25%",

  // Logo position
  logoTop: "10%",
  logoHeight: "43%",
  logoWidth: "25%",

  // Injury time
  injuryTimeColor: "white",
  injuryTimeFontSize: "2rem",
  injuryTimeTop: "18%",
  injuryTimeLeft: "45%",
  injuryTimeStroke: "none",

  // Team name
  teamNameColor: "white",
  teamNameFontFamily: '"Anton", sans-serif',

  // Red cards
  redCardColor: "#e60000",

  // Penalty boxes
  penaltyBg: "black",
  penaltyColor: "white",
  penaltyBorder: "1px solid white",

  // Timeout dots
  timeoutColor: "red",

  // Idle screen
  idleTextColor: "#ffffff",
  idleTextFontSize: "40px",
  idleLogoTop: "5%",
  idleLogoLeft: "15%",
  idleLogoWidth: "30%",
  idleTextTop: "65%",

  // Ad image position (scoreboard)
  adTop: "73%",
  adLeft: "33.5%",
  adWidth: "33%",
  adHeight: "25%",

  // Background image (URL from Firebase Storage, or empty for none)
  backgroundImage: "",
};

export const BUILT_IN_PRESET_NAMES = new Set([
  "Default",
  "Vikes Dark",
  "Vikes Light",
  "Minimal",
  "Blue Ice",
  "Retro",
]);

export const THEME_PRESETS: Record<string, ThemeConfig> = {
  Default: DEFAULT_THEME,

  // Dark red Víkingur theme — large scores in lower corners, compact clock bar up top
  "Vikes Dark": {
    ...DEFAULT_THEME,
    scoreBoxBg: "rgba(140,0,10,0.92)",
    scoreBoxColor: "#fff",
    scoreBoxBorder: "3px solid #ff2030",
    scoreBoxFontSize: "3.2rem",
    scoreBoxFontFamily: '"Bebas Neue", sans-serif',
    scoreTop: "52%",
    scoreHeight: "40%",
    scoreWidth: "28%",
    clockBg: "rgba(30,0,0,0.9)",
    clockColor: "#ff8080",
    clockBorder: "2px solid #ff2030",
    clockFontSizeMin: "1.5rem",
    clockFontSizeMax: "1.7rem",
    clockFontFamily: '"Bebas Neue", sans-serif',
    clockTop: "42%",
    clockLeft: "35%",
    clockWidth: "30%",
    clockHeight: "15%",
    logoTop: "5%",
    logoHeight: "38%",
    logoWidth: "30%",
    injuryTimeColor: "#ff4040",
    injuryTimeFontSize: "1.8rem",
    teamNameColor: "#ffcccc",
    teamNameFontFamily: '"Bebas Neue", sans-serif',
    penaltyBg: "rgba(140,0,10,0.85)",
    penaltyColor: "#fff",
    penaltyBorder: "2px solid #ff2030",
    redCardColor: "#ff1a1a",
    timeoutColor: "#ff2030",
    idleTextColor: "#ffcccc",
    idleTextFontSize: "44px",
  },

  // Light translucent theme — wide spacing, large logos, Oswald font
  "Vikes Light": {
    ...DEFAULT_THEME,
    scoreBoxBg: "rgba(255,255,255,0.88)",
    scoreBoxColor: "#1a0000",
    scoreBoxBorder: "2px solid #c7000f",
    scoreBoxFontSize: "2.8rem",
    scoreBoxFontFamily: '"Oswald", sans-serif',
    scoreTop: "55%",
    scoreHeight: "36%",
    scoreWidth: "22%",
    clockBg: "rgba(255,255,255,0.88)",
    clockColor: "#1a0000",
    clockBorder: "2px solid #c7000f",
    clockFontSizeMin: "1.6rem",
    clockFontSizeMax: "1.8rem",
    clockFontFamily: '"Oswald", sans-serif',
    clockTop: "44%",
    clockLeft: "30%",
    clockWidth: "40%",
    clockHeight: "18%",
    logoTop: "3%",
    logoHeight: "48%",
    logoWidth: "28%",
    injuryTimeColor: "#c7000f",
    injuryTimeFontSize: "2.2rem",
    teamNameColor: "#1a0000",
    teamNameFontFamily: '"Oswald", sans-serif',
    penaltyBg: "rgba(255,255,255,0.85)",
    penaltyColor: "#1a0000",
    penaltyBorder: "2px solid #c7000f",
    redCardColor: "#c7000f",
    timeoutColor: "#c7000f",
    idleTextColor: "#1a0000",
    idleTextFontSize: "38px",
    idleLogoTop: "8%",
    idleLogoWidth: "35%",
  },

  // Broadcast minimal — no boxes, oversized score digits, tiny clock, clean look
  Minimal: {
    ...DEFAULT_THEME,
    scoreBoxBg: "transparent",
    scoreBoxColor: "white",
    scoreBoxBorder: "none",
    scoreBoxFontSize: "4rem",
    scoreBoxFontFamily: '"Russo One", sans-serif',
    scoreBoxStroke: "1px black",
    scoreTop: "50%",
    scoreHeight: "42%",
    scoreWidth: "20%",
    clockBg: "transparent",
    clockColor: "rgba(255,255,255,0.7)",
    clockBorder: "none",
    clockFontSizeMin: "1.2rem",
    clockFontSizeMax: "1.4rem",
    clockFontFamily: '"Russo One", sans-serif',
    clockStroke: "1px black",
    clockTop: "42%",
    clockLeft: "37%",
    clockWidth: "26%",
    clockHeight: "12%",
    logoTop: "5%",
    logoHeight: "40%",
    logoWidth: "22%",
    injuryTimeColor: "rgba(255,255,255,0.6)",
    injuryTimeFontSize: "1.6rem",
    injuryTimeStroke: "1px black",
    teamNameColor: "rgba(255,255,255,0.8)",
    teamNameFontFamily: '"Russo One", sans-serif',
    penaltyBg: "transparent",
    penaltyColor: "white",
    penaltyBorder: "none",
    timeoutColor: "#ff4444",
    idleTextColor: "rgba(255,255,255,0.9)",
    idleTextFontSize: "48px",
    idleLogoTop: "10%",
    idleLogoLeft: "20%",
    idleLogoWidth: "25%",
    idleTextTop: "60%",
  },

  // Sci-fi neon blue — Orbitron digital font, glowing borders, compact centered cluster
  "Blue Ice": {
    ...DEFAULT_THEME,
    scoreBoxBg: "rgba(0,10,40,0.95)",
    scoreBoxColor: "#00e5ff",
    scoreBoxBorder: "2px solid #0080ff",
    scoreBoxFontSize: "2.6rem",
    scoreBoxFontFamily: '"Orbitron", sans-serif',
    scoreTop: "58%",
    scoreHeight: "32%",
    scoreWidth: "24%",
    clockBg: "rgba(0,10,40,0.95)",
    clockColor: "#00e5ff",
    clockBorder: "2px solid #0080ff",
    clockFontSizeMin: "1.8rem",
    clockFontSizeMax: "2rem",
    clockFontFamily: '"Orbitron", sans-serif',
    clockTop: "44%",
    clockLeft: "28%",
    clockWidth: "44%",
    clockHeight: "20%",
    logoTop: "4%",
    logoHeight: "42%",
    logoWidth: "24%",
    injuryTimeColor: "#0080ff",
    injuryTimeFontSize: "1.8rem",
    teamNameColor: "#80d0ff",
    teamNameFontFamily: '"Orbitron", sans-serif',
    penaltyBg: "rgba(0,10,40,0.9)",
    penaltyColor: "#00e5ff",
    penaltyBorder: "2px solid #0080ff",
    redCardColor: "#ff2040",
    timeoutColor: "#0080ff",
    idleTextColor: "#80d0ff",
    idleTextFontSize: "36px",
    idleLogoTop: "8%",
    idleLogoLeft: "18%",
    idleLogoWidth: "28%",
    idleTextTop: "62%",
  },

  // Retro scoreboard — monospace font, green-on-black, tight horizontal bar
  Retro: {
    ...DEFAULT_THEME,
    scoreBoxBg: "#001a00",
    scoreBoxColor: "#33ff33",
    scoreBoxBorder: "2px solid #33ff33",
    scoreBoxFontSize: "2.4rem",
    scoreBoxFontFamily: "monospace",
    scoreTop: "60%",
    scoreHeight: "30%",
    scoreWidth: "22%",
    clockBg: "#001a00",
    clockColor: "#33ff33",
    clockBorder: "2px solid #33ff33",
    clockFontSizeMin: "2rem",
    clockFontSizeMax: "2.2rem",
    clockFontFamily: "monospace",
    clockTop: "48%",
    clockLeft: "25%",
    clockWidth: "50%",
    clockHeight: "18%",
    logoTop: "3%",
    logoHeight: "48%",
    logoWidth: "24%",
    injuryTimeColor: "#33ff33",
    injuryTimeFontSize: "1.8rem",
    teamNameColor: "#33ff33",
    teamNameFontFamily: "monospace",
    penaltyBg: "#001a00",
    penaltyColor: "#33ff33",
    penaltyBorder: "2px solid #33ff33",
    redCardColor: "#ff3333",
    timeoutColor: "#33ff33",
    idleTextColor: "#33ff33",
    idleTextFontSize: "32px",
    idleLogoTop: "5%",
    idleLogoLeft: "12%",
    idleLogoWidth: "25%",
    idleTextTop: "68%",
  },
};
