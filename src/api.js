
const store = window.localStorage;

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
            freeTextAsset: '',
        },
    },
    view: 'IDLE',
};

const checkObjectKeys = (newState, against = defaultState) => {
    const newStateKeys = Object.keys(newState);
    const againstKeys = Object.keys(against);
    if (newStateKeys.length === againstKeys.length) {
        againstKeys.forEach((key) => {
            if (newState[key] === undefined) {
                console.error(`Missing ${key} in newState`);
            }
            if (against[key] && Object.prototype.toString.call(against[key]) === '[object Object]') {
                checkObjectKeys(newState[key], against[key]);
            }
        });
    } else {
        console.error('Key count differs', newState, against);
    }
};

const saveState = (newState) => {
    checkObjectKeys(newState);
    store.setItem('state', JSON.stringify(newState));
    return newState;
};

export const clearState = () => new Promise(resolve => resolve(saveState(defaultState)));

export const getState = () => new Promise((resolve) => {
    const stateText = store.getItem('state');
    if (!stateText) {
        return resolve(saveState(defaultState));
    }
    try {
        const result = JSON.parse(stateText);
        const allExists = Object.keys(defaultState).every(key => result[key]);
        if (!allExists) {
            throw new Error('Missing some keys');
        }
        return resolve(result);
    } catch (e) {
        console.error('e', e);
        store.removeItem('state');
        return getState();
    }
});

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
    .then(state => saveState({ ...state, controller }));
