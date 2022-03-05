import keymirror from "keymirror";
import { handleActions } from "redux-actions";
import { ActionType } from "redux-promise-middleware";

import ActionTypes from "../ActionTypes";

export const ASSET_VIEWS = keymirror({
  assets: null,
  teams: null,
});

export const VIEWS = keymirror({
  idle: null,
  match: null,
  control: null,
});

export const TABS = keymirror({
  home: null,
  settings: null,
});

export const initialState = {
  selectedAssets: [],
  cycle: false,
  imageSeconds: 3,
  autoPlay: false,
  playing: false,
  assetView: ASSET_VIEWS.assets,
  view: VIEWS.idle,
  availableMatches: {},
  selectedMatch: null,
  currentAsset: "",
};

const getStateShowingNextAsset = (state) => {
  const { cycle, selectedAssets, imageSeconds, autoPlay } = state;
  const newState = { ...state };
  if (!selectedAssets.length) {
    newState.playing = false;
    newState.currentAsset = null;
  } else {
    const nextAsset = selectedAssets.shift();
    newState.currentAsset = {
      asset: nextAsset,
      time: autoPlay ? imageSeconds : null,
    };
    if (autoPlay) {
      newState.playing = true;
    }
    if (cycle) {
      newState.selectedAssets = [...selectedAssets, nextAsset];
    } else {
      newState.selectedAssets = [...selectedAssets];
    }
  }
  return newState;
};

const actions = {
  [ActionTypes.selectView]: {
    next(state, { payload: { view } }) {
      return { ...state, view };
    },
  },
  [ActionTypes.selectAssetView]: {
    next(state, { payload: { assetView } }) {
      return { ...state, assetView };
    },
  },
  [ActionTypes.selectTab]: {
    next(state, { payload: { tab } }) {
      return { ...state, tab };
    },
  },
  [ActionTypes.clearMatchPlayers]: {
    next(state) {
      return {
        ...state,
        availableMatches: {},
        selectedMatch: null,
      };
    },
  },
  [ActionTypes.selectMatch]: {
    next(state, { payload }) {
      return {
        ...state,
        selectedMatch: payload,
      };
    },
  },
  [`${ActionTypes.getAvailableMatches}_${ActionType.Fulfilled}`]: {
    next(
      state,
      {
        payload: {
          data: { matches },
        },
      }
    ) {
      return {
        ...state,
        availableMatches: matches || {},
        selectedMatch: Object.keys(matches || {})[0] || null,
      };
    },
  },
  [ActionTypes.editPlayer]: {
    next(state, { payload: { teamId, idx, updatedPlayer } }) {
      const { availableMatches, selectedMatch } = state;
      // TODO why not immutable
      const match = JSON.parse(JSON.stringify(availableMatches[selectedMatch]));
      match.players[teamId][idx] = {
        ...match.players[teamId][idx],
        ...updatedPlayer,
      };
      return {
        ...state,
        availableMatches: {
          ...availableMatches,
          [selectedMatch]: match,
        },
      };
    },
  },
  [ActionTypes.deletePlayer]: {
    next(state, { payload: { teamId, idx } }) {
      const { availableMatches, selectedMatch } = state;
      // TODO why not immutable
      const match = JSON.parse(JSON.stringify(availableMatches[selectedMatch]));
      match.players[teamId] = match.players[teamId].filter(
        (item, i) => i !== idx
      );
      return {
        ...state,
        availableMatches: {
          ...availableMatches,
          [selectedMatch]: match,
        },
      };
    },
  },
  [ActionTypes.addPlayer]: {
    next(state, { payload: { teamId } }) {
      const { availableMatches, selectedMatch } = state;
      // TODO why not immutable
      if (!availableMatches[selectedMatch]) {
        return state;
      }
      const match = JSON.parse(JSON.stringify(availableMatches[selectedMatch]));
      if (!match.players[teamId]) {
        match.players[teamId] = [];
      }
      match.players[teamId].push({
        name: "",
        number: "",
        show: false,
        role: "",
      });
      return {
        ...state,
        availableMatches: {
          ...availableMatches,
          [selectedMatch]: match,
        },
      };
    },
  },
  [ActionTypes.updateAssets]: {
    next(state, { payload }) {
      return {
        selectedAssets: [],
        ...state,
        ...payload,
      };
    },
  },

  [ActionTypes.toggleCycle]: {
    next(state) {
      return {
        ...state,
        cycle: !state.cycle,
      };
    },
  },
  [ActionTypes.setImageSeconds]: {
    next(state, { payload: { imageSeconds } }) {
      return {
        ...state,
        imageSeconds,
      };
    },
  },
  [ActionTypes.toggleAutoPlay]: {
    next(state) {
      const playing = state.autoPlay ? false : state.playing;
      return {
        ...state,
        autoPlay: !state.autoPlay,
        playing,
      };
    },
  },
  [ActionTypes.setPlaying]: {
    next(state, { payload: { playing } }) {
      return {
        ...state,
        playing,
      };
    },
  },
  [ActionTypes.setSelectedAssets]: {
    next(state, { payload: { selectedAssets } }) {
      return {
        ...state,
        selectedAssets: selectedAssets || [],
      };
    },
  },
  [ActionTypes.receiveRemoteData]: {
    next(state, { data, path }) {
      if (path === "controller" && data) {
        const results = { ...state, ...data };
        if (!results.selectedAssets) {
          results.selectedAssets = [];
        }
        return results;
      }
      return state;
    },
  },
  [ActionTypes.renderAsset]: {
    next(state, { payload: { asset } }) {
      return { ...state, currentAsset: asset };
    },
  },
  [ActionTypes.showNextAsset]: {
    next(state) {
      return getStateShowingNextAsset(state);
    },
  },
  [ActionTypes.removeAssetAfterTimeout]: {
    next(state) {
      const { playing, autoPlay } = state;
      if (autoPlay) {
        if (playing) {
          return getStateShowingNextAsset(state);
        }
        return state;
      }
      return { ...state, currentAsset: null };
    },
  },
};
export default handleActions(actions, initialState);
