import keymirror from 'keymirror';

export default keymirror({
    // Match
    updateMatch: null,
    removePenalty: null,
    addTimeout: null,
    pauseMatch: null,
    updateHalfLength: null,
    matchTimeout: null,
    removeTimeout: null,

    // Controller
    selectView: null,
    selectAssetView: null,
    getAvailableMatches: null,
    getRuvUrl: null,
    clearMatchPlayers: null,
    selectMatch: null,
    editPlayer: null,
    deletePlayer: null,
    addPlayer: null,
    updateAssets: null,

    // View
    setViewPort: null,

    // Global
    clearState: null,
});
