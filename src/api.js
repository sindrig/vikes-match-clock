const store = window.localStorage;

const defaultState = {
    match: {
        homeScore: 0,
        awayScore: 0,
        started: null,
        half: 1,
    },
};

const saveState = (newState) => {
    store.setItem('state', JSON.stringify(newState));
    return newState;
};

export const getState = () => new Promise((resolve) => {
    const stateText = store.getItem('state');
    if (!stateText) {
        return resolve(saveState(defaultState));
    }
    try {
        return resolve(JSON.parse(stateText));
    } catch (e) {
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
    homeScore, awayScore, started, half,
}) => getState().then((state) => {
    const match = {
        homeScore: positiveNumber(homeScore),
        awayScore: positiveNumber(awayScore),
        started: notBeforeNow(started),
        half,
    };
    return saveState({ ...state, match });
});

export const updateView = view => getState().then(state => saveState({ ...state, view }));
