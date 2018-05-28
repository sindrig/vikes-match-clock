
export const ASSET_VIEWS = {
    assets: 'assets',
    team: 'team',
};

const INITIAL = {
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
};

export default (state, action) => {
    if (state === undefined) {
        return INITIAL;
    }
    // console.log('state, action', state, action);
    return { ...state, ...action.payload };
};
