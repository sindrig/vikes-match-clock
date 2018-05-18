const store = window.localStorage;

const defaultMatch = {
    homeScore: 0,
    awayScore: 0,
    started: null,
};

const save = (match) => {
    store.setItem('match', JSON.stringify(match));
    return match;
};

export const getMatch = () => new Promise((resolve) => {
    const matchText = store.getItem('match');
    if (!matchText) {
        save(defaultMatch);
        return resolve(defaultMatch);
    }
    try {
        return resolve(JSON.parse(matchText));
    } catch (e) {
        store.removeItem('match');
        return getMatch();
    }
});

export const startMatch = () => getMatch().then((match) => {
    const updated = { ...match, started: Date.now() };
    return save(updated);
});

const positiveNumber = score => (
    score < 0 ? 0 : score
);

const notBeforeNow = timestamp => (
    timestamp > Date.now() ? Date.now() : timestamp
);

export const update = ({ homeScore, awayScore, started }) => new Promise((resolve) => {
    const updated = {
        homeScore: positiveNumber(homeScore),
        awayScore: positiveNumber(awayScore),
        started: notBeforeNow(started),
    };
    return resolve(save(updated));
});

export const resetClock = () => getMatch().then((match) => {
    const updated = {
        ...match,
        started: null,
    };
    return save(updated);
});
