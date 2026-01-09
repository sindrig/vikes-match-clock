import keymirror from "keymirror";
import { handleActions, Action } from "redux-actions";

import ActionTypes from "../ActionTypes";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workaround for redux-actions computed property names limitation
const AT: any = ActionTypes;
import assetTypes from "../controller/asset/AssetTypes";
import type {
  ControllerState,
  Asset,
  Player,
  AvailableMatches,
} from "../types";

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

export const initialState: ControllerState = {
  selectedAssets: [],
  cycle: false,
  imageSeconds: 3,
  autoPlay: false,
  playing: false,
  assetView: ASSET_VIEWS.assets,
  view: VIEWS.idle,
  availableMatches: {},
  selectedMatch: null,
  currentAsset: null,
  refreshToken: "",
};

const getStateShowingNextAsset = (state: ControllerState): ControllerState => {
  const { cycle, selectedAssets, imageSeconds, autoPlay } = state;
  const newState = { ...state };
  if (!selectedAssets.length) {
    newState.playing = false;
    newState.currentAsset = null;
  } else {
    const nextAsset = selectedAssets.shift();
    if (!nextAsset) {
      newState.playing = false;
      newState.currentAsset = null;
      return newState;
    }
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

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- AT is intentionally 'any' due to redux-actions limitations */
const actions = {
  [AT.selectView]: {
    next(
      state: ControllerState,
      { payload: { view } }: Action<{ view: string }>,
    ) {
      return { ...state, view };
    },
  },
  [AT.selectAssetView]: {
    next(
      state: ControllerState,
      { payload: { assetView } }: Action<{ assetView: string }>,
    ) {
      return { ...state, assetView };
    },
  },
  [AT.selectTab]: {
    next(
      state: ControllerState,
      { payload: { tab } }: Action<{ tab: string }>,
    ) {
      return { ...state, tab };
    },
  },
  [AT.clearMatchPlayers]: {
    next(state: ControllerState) {
      return {
        ...state,
        availableMatches: {},
        selectedMatch: null,
      };
    },
  },
  [AT.selectMatch]: {
    next(state: ControllerState, { payload }: Action<string>) {
      const selectedMatch = parseInt(payload, 10);
      if (!isNaN(selectedMatch)) {
        return {
          ...state,
          selectedMatch,
        };
      }
      return state;
    },
  },
  [`${String(ActionTypes.getAvailableMatches)}_FULFILLED`]: {
    next(
      state: ControllerState,
      {
        payload: {
          data: { matches },
        },
      }: Action<{ data: { matches: AvailableMatches } }>,
    ) {
      return {
        ...state,
        availableMatches: matches || {},
        selectedMatch: Object.keys(matches || {})[0] || null,
      };
    },
  },
  [AT.setAvailableMatches]: {
    next(
      state: ControllerState,
      { payload: { matches } }: Action<{ matches: AvailableMatches }>,
    ) {
      return {
        ...state,
        availableMatches: matches || {},
        selectedMatch: Object.keys(matches || {})[0] || null,
      };
    },
  },
  [AT.editPlayer]: {
    next(
      state: ControllerState,
      {
        payload: { teamId, idx, updatedPlayer },
      }: Action<{
        teamId: string;
        idx: number;
        updatedPlayer: Partial<Player>;
      }>,
    ) {
      const { availableMatches, selectedMatch } = state;
      // TODO why not immutable
      const match = JSON.parse(
        JSON.stringify(availableMatches[selectedMatch!]),
      );
      match.players[teamId][idx] = {
        ...match.players[teamId][idx],
        ...updatedPlayer,
      };
      return {
        ...state,
        availableMatches: {
          ...availableMatches,
          [selectedMatch!]: match,
        },
      };
    },
  },
  [AT.deletePlayer]: {
    next(
      state: ControllerState,
      { payload: { teamId, idx } }: Action<{ teamId: string; idx: number }>,
    ) {
      const { availableMatches, selectedMatch } = state;
      // TODO why not immutable
      const match = JSON.parse(
        JSON.stringify(availableMatches[selectedMatch!]),
      );
      match.players[teamId] = match.players[teamId].filter(
        (_item: Player, i: number) => i !== idx,
      );
      return {
        ...state,
        availableMatches: {
          ...availableMatches,
          [selectedMatch!]: match,
        },
      };
    },
  },
  [AT.addPlayer]: {
    next(
      state: ControllerState,
      { payload: { teamId } }: Action<{ teamId: string }>,
    ) {
      const { availableMatches, selectedMatch } = state;
      // TODO why not immutable
      if (!selectedMatch || !availableMatches[selectedMatch]) {
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
  [AT.updateAssets]: {
    next(
      state: ControllerState,
      { payload }: Action<Partial<ControllerState>>,
    ) {
      return {
        ...state,
        selectedAssets: [],
        ...payload,
      };
    },
  },

  [AT.toggleCycle]: {
    next(state: ControllerState) {
      return {
        ...state,
        cycle: !state.cycle,
      };
    },
  },
  [AT.setImageSeconds]: {
    next(
      state: ControllerState,
      { payload: { imageSeconds } }: Action<{ imageSeconds: number }>,
    ) {
      return {
        ...state,
        imageSeconds,
      };
    },
  },
  [AT.toggleAutoPlay]: {
    next(state: ControllerState) {
      const playing = state.autoPlay ? false : state.playing;
      return {
        ...state,
        autoPlay: !state.autoPlay,
        playing,
      };
    },
  },
  [AT.setPlaying]: {
    next(
      state: ControllerState,
      { payload: { playing } }: Action<{ playing: boolean }>,
    ) {
      return {
        ...state,
        playing,
      };
    },
  },
  [AT.setSelectedAssets]: {
    next(
      state: ControllerState,
      { payload: { selectedAssets } }: Action<{ selectedAssets: Asset[] }>,
    ) {
      return {
        ...state,
        selectedAssets: selectedAssets || [],
      };
    },
  },
  [AT.addAssets]: {
    next(
      state: ControllerState,
      { payload: { assets } }: Action<{ assets: Asset[] }>,
    ) {
      const updatedAssets = [...(state.selectedAssets || [])];
      assets.forEach((asset: Asset) => {
        // Make sure that the asset type is in assetTypes
        // And make sure that the asset key is not null/undefined/empty
        if (Object.keys(assetTypes).indexOf(asset.type) !== -1 && asset.key) {
          if (updatedAssets.map((s) => s.key).indexOf(asset.key) === -1) {
            updatedAssets.push(asset);
          }
        }
      });
      return {
        ...state,
        selectedAssets: updatedAssets,
      };
    },
  },
  [AT.removeAsset]: {
    next(
      state: ControllerState,
      { payload: { asset } }: Action<{ asset: Asset }>,
    ) {
      const idx = state.selectedAssets.map((a) => a.key).indexOf(asset.key);
      if (idx > -1) {
        const newAssets = [...state.selectedAssets];
        newAssets.splice(idx, 1);
        return {
          ...state,
          selectedAssets: newAssets,
        };
      }
      return state;
    },
  },
  [AT.receiveRemoteData]: {
    next(
      state: ControllerState,
      { data, storeAs }: { data: unknown; storeAs: string },
    ) {
      if (
        storeAs === "controller" &&
        data &&
        typeof data === "object" &&
        data !== null
      ) {
        const results = { ...state, ...(data as Partial<ControllerState>) };
        if (!results.selectedAssets) {
          results.selectedAssets = [];
        }
        return results;
      }
      return state;
    },
  },
  [AT.renderAsset]: {
    next(
      state: ControllerState,
      { payload: { asset } }: Action<{ asset: Asset | null }>,
    ) {
      return {
        ...state,
        currentAsset: asset ? { asset, time: null } : null,
      };
    },
  },
  [AT.showNextAsset]: {
    next(state: ControllerState) {
      return getStateShowingNextAsset(state);
    },
  },
  [AT.removeAssetAfterTimeout]: {
    next(state: ControllerState) {
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
  [AT.remoteRefresh]: {
    next(state: ControllerState) {
      return {
        ...state,
        refreshToken: (Math.random() + 1).toString(36).substring(2),
      };
    },
  },
};
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
export default handleActions(actions, initialState);
