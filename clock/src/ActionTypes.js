import keymirror from "keymirror";

export const Match = keymirror({
  updateMatch: null,
  removePenalty: null,
  addToPenalty: null,
  addPenalty: null,
  pauseMatch: null,
  startMatch: null,
  updateHalfLength: null,
  setHalfStops: null,
  matchTimeout: null,
  removeTimeout: null,
  buzz: null,
  addGoal: null,
  countdown: null,
});

export const Controller = keymirror({
  selectView: null,
  selectAssetView: null,
  getAvailableMatches: null,
  setAvailableMatches: null,
  getRuvUrl: null,
  clearMatchPlayers: null,
  selectMatch: null,
  editPlayer: null,
  deletePlayer: null,
  addPlayer: null,
  // updateAssets: null,
  clearAsset: null,
  toggleCycle: null,
  setImageSeconds: null,
  toggleAutoPlay: null,
  setPlaying: null,
  setSelectedAssets: null,
  addAssets: null,
  removeAsset: null,
  showNextAsset: null,
  renderAsset: null,
  selectTab: null,
  removeAssetAfterTimeout: null,
  remoteRefresh: null,
});

export const View = keymirror({
  setViewPort: null,
  setBackground: null,
  setIdleImage: null,
});

export const Global = keymirror({
  clearState: null,
});

export const Remote = keymirror({
  setEmail: null,
  setPassword: null,
  setSync: null,
  setListenPrefix: null,
  receiveRemoteData: null,
});

export default {
  ...Match,
  ...Controller,
  ...View,
  ...Global,
  ...Remote,
};
