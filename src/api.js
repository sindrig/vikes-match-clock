import DB from './db';


export const ASSET_VIEWS = {
    assets: 'assets',
    team: 'team',
};

const defaultState = {
    match: {
        homeScore: 0,
        awayScore: 0,
        started: null,
        half: 1,
        homeTeam: 'Víkingur R',
        awayTeam: null,
    },
    controller: {
        assets: {
            selectedAssets: [],
            cycle: false,
            imageSeconds: 3,
            autoPlay: false,
        },
        teamPlayers: {
            homeTeam: [],
            awayTeam: [],
        },
        assetView: ASSET_VIEWS.assets,
    },
    view: 'IDLE',
};

const db = new DB(defaultState);

const checkObjectKeys = (newState, against = defaultState, depth = 0) => {
    const filterUpper = key => !depth && key !== key.toUpperCase();
    const newStateKeys = Object.keys(newState).filter(filterUpper);
    const againstKeys = Object.keys(against).filter(filterUpper);
    if (newStateKeys.length === againstKeys.length) {
        againstKeys.forEach((key) => {
            if (newState[key] === undefined) {
                console.error(`Missing ${key} in newState`);
            } else if (against[key] && Object.prototype.toString.call(against[key]) === '[object Object]') {
                checkObjectKeys(newState[key], against[key], depth + 1);
            }
        });
    } else {
        console.log('depth', depth);
        console.error('Key count differs', newState, against);
    }
};

const saveState = (newState) => {
    checkObjectKeys(newState);
    return db.setAllData(newState);
};

export const clearState = db.clear;

export const getState = db.getAllData;

const positiveNumber = (score) => {
    if (Number.isNaN(score)) {
        return 0;
    }
    return score < 0 ? 0 : score;
};

const notBeforeNow = timestamp => (
    timestamp > Date.now() ? Date.now() : timestamp
);

export const updateMatch = ({
    homeScore, awayScore, started, half, homeTeam, awayTeam,
}) => getState().then((state) => {
    const match = {
        homeScore: positiveNumber(homeScore),
        awayScore: positiveNumber(awayScore),
        started: notBeforeNow(started),
        half,
        homeTeam,
        awayTeam,
    };
    return saveState({ ...state, match });
});

export const updateView = view => getState().then(state => saveState({ ...state, view }));
export const updateController = controller => getState()
    .then(state => saveState({ ...state, controller: { ...state.controller, ...controller } }));

export const getKey = key => db.get(key);
export const setKey = (key, value) => db.set(key, value);
