// Action Types for Match
export enum MatchActionType {
  UPDATE_MATCH = "updateMatch",
  REMOVE_PENALTY = "removePenalty",
  ADD_TO_PENALTY = "addToPenalty",
  ADD_PENALTY = "addPenalty",
  PAUSE_MATCH = "pauseMatch",
  START_MATCH = "startMatch",
  UPDATE_HALF_LENGTH = "updateHalfLength",
  SET_HALF_STOPS = "setHalfStops",
  MATCH_TIMEOUT = "matchTimeout",
  REMOVE_TIMEOUT = "removeTimeout",
  BUZZ = "buzz",
  ADD_GOAL = "addGoal",
  COUNTDOWN = "countdown",
  UPDATE_RED_CARDS = "updateRedCards",
}

// Action Types for Controller
export enum ControllerActionType {
  SELECT_VIEW = "selectView",
  SELECT_ASSET_VIEW = "selectAssetView",
  GET_AVAILABLE_MATCHES = "getAvailableMatches",
  SET_AVAILABLE_MATCHES = "setAvailableMatches",
  GET_RUV_URL = "getRuvUrl",
  CLEAR_MATCH_PLAYERS = "clearMatchPlayers",
  SELECT_MATCH = "selectMatch",
  EDIT_PLAYER = "editPlayer",
  DELETE_PLAYER = "deletePlayer",
  ADD_PLAYER = "addPlayer",
  CLEAR_ASSET = "clearAsset",
  TOGGLE_CYCLE = "toggleCycle",
  SET_IMAGE_SECONDS = "setImageSeconds",
  TOGGLE_AUTO_PLAY = "toggleAutoPlay",
  SET_PLAYING = "setPlaying",
  SET_SELECTED_ASSETS = "setSelectedAssets",
  ADD_ASSETS = "addAssets",
  REMOVE_ASSET = "removeAsset",
  SHOW_NEXT_ASSET = "showNextAsset",
  RENDER_ASSET = "renderAsset",
  SELECT_TAB = "selectTab",
  REMOVE_ASSET_AFTER_TIMEOUT = "removeAssetAfterTimeout",
  REMOTE_REFRESH = "remoteRefresh",
}

// Action Types for View
export enum ViewActionType {
  SET_VIEW_PORT = "setViewPort",
  SET_BACKGROUND = "setBackground",
  SET_IDLE_IMAGE = "setIdleImage",
}

// Action Types for Global
export enum GlobalActionType {
  CLEAR_STATE = "clearState",
}

// Action Types for Remote
export enum RemoteActionType {
  SET_EMAIL = "setEmail",
  SET_PASSWORD = "setPassword",
  SET_SYNC = "setSync",
  SET_LISTEN_PREFIX = "setListenPrefix",
  RECEIVE_REMOTE_DATA = "receiveRemoteData",
}

// Combined action types
export type ActionType =
  | MatchActionType
  | ControllerActionType
  | ViewActionType
  | GlobalActionType
  | RemoteActionType;

// Export all action types as an object for backward compatibility
export const Match = Object.values(MatchActionType).reduce(
  (acc, val) => {
    acc[val] = val;
    return acc;
  },
  {} as Record<string, string>,
);

export const Controller = Object.values(ControllerActionType).reduce(
  (acc, val) => {
    acc[val] = val;
    return acc;
  },
  {} as Record<string, string>,
);

export const View = Object.values(ViewActionType).reduce(
  (acc, val) => {
    acc[val] = val;
    return acc;
  },
  {} as Record<string, string>,
);

export const Global = Object.values(GlobalActionType).reduce(
  (acc, val) => {
    acc[val] = val;
    return acc;
  },
  {} as Record<string, string>,
);

export const Remote = Object.values(RemoteActionType).reduce(
  (acc, val) => {
    acc[val] = val;
    return acc;
  },
  {} as Record<string, string>,
);

const AllActionTypes = {
  ...Match,
  ...Controller,
  ...View,
  ...Global,
  ...Remote,
};

export default AllActionTypes;
