export const initialState = {
    homeScore: 0,
    awayScore: 0,
    started: null,
    half: 1,
    homeTeam: 'Víkingur R',
    awayTeam: null,
};

export default (state, action) => {
    if (state === undefined) {
        return initialState;
    }
    return { ...initialState, ...action.payload };
};
