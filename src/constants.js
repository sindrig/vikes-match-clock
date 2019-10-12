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
    [SPORTS.football]: [45, 90, 105, 120],
    [SPORTS.handball]: [30, 60, 65, 70],
};
