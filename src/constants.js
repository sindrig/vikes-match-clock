import keymirror from 'keymirror';
import backgroundImage from './images/background.png';

export const THUMB_VP = {
    height: 50,
    width: 100,
};


const backgrounds = [
    { backgroundImage: `url(${backgroundImage})` },
    { backgroundColor: 'black' },
    { backgroundImage: 'repeating-linear-gradient(90deg,#181003,#181003 25px,#2D1201 25px,#2D1201 50px)' },
    {},
];

export const BACKGROUND = backgrounds[2];

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
    [SPORTS.football]: HALFSTOPS[SPORTS.football]['45'],
    [SPORTS.handball]: HALFSTOPS[SPORTS.handball]['30'],
};
