const store = window.localStorage;

const defaultMatch = {
    homeScore: 0,
    awayScore: 0,
    started: null,
};

const save = match => store.setItem('match', JSON.stringify(match));

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
    save(updated);
    return updated;
});

export const updateScore = ({ homeScore, awayScore }) => getMatch().then((match) => {
    const updated = { ...match, homeScore, awayScore };
    save(updated);
    return updated;
});
