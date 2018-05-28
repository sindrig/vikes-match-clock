const INITIAL = {
    view: null,
};

export default (state, action) => {
    if (state === undefined) {
        return INITIAL;
    }
    return { ...state, ...action.payload };
};
