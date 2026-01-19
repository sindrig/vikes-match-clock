import { createAction, Action } from "redux-actions";
import axios, { AxiosResponse } from "axios";
import apiConfig from "../apiConfig";
import lambdaExample from "../debug/lambda-example";
import clubIds from "../club-ids";
import { Asset, AvailableMatches, Player, ClubRosterPlayer } from "../types";

const DEBUG = false;

interface ActionCreators {
  selectView: (view: string) => Action<{ view: string }>;
  selectTab: (tab: string) => Action<{ tab: string }>;
  selectAssetView: (assetView: string) => Action<{ assetView: string }>;
  clearMatchPlayers: () => Action<Record<string, never>>;
  selectMatch: (matchId: string) => Action<string>;
  editPlayer: (
    teamId: string,
    idx: number,
    updatedPlayer: Partial<Player>,
  ) => Action<{ teamId: string; idx: number; updatedPlayer: Partial<Player> }>;
  deletePlayer: (
    teamId: string,
    idx: number,
  ) => Action<{ teamId: string; idx: number }>;
  addPlayer: (teamId: string) => Action<{ teamId: string }>;
  toggleCycle: () => Action<Record<string, never>>;
  setImageSeconds: (imageSeconds: number) => Action<{ imageSeconds: number }>;
  toggleAutoPlay: () => Action<Record<string, never>>;
  removeAssetAfterTimeout: () => Action<Record<string, never>>;
  showNextAsset: () => Action<Record<string, never>>;
  remoteRefresh: () => Action<Record<string, never>>;
  setPlaying: (playing: boolean) => Action<{ playing: boolean }>;
  renderAsset: (asset: Asset | null) => Action<{ asset: Asset | null }>;
  setSelectedAssets: (
    selectedAssets: Asset[],
  ) => Action<{ selectedAssets: Asset[] }>;
  addAssets: (assets: Asset[]) => Action<{ assets: Asset[] }>;
  removeAsset: (asset: Asset) => Action<{ asset: Asset }>;
  setAvailableMatches: (
    matches: AvailableMatches,
  ) => Action<{ matches: AvailableMatches }>;
  getAvailableMatches: (
    homeTeam: string,
    awayTeam: string,
  ) => Promise<AxiosResponse | typeof lambdaExample>;
  updateClubRosterPlayer: (
    clubId: string,
    ksiId: string,
    player: ClubRosterPlayer,
  ) => Action<{ clubId: string; ksiId: string; player: ClubRosterPlayer }>;
}

const actionPayloads: Record<
  string,
  ((...args: never[]) => unknown) | undefined
> = {
  selectView: (view: string) => ({ view }),
  selectTab: (tab: string) => ({ tab }),
  selectAssetView: (assetView: string) => ({ assetView }),
  clearMatchPlayers: () => ({}),
  selectMatch: (matchId: string) => matchId,
  editPlayer: (
    teamId: string,
    idx: number,
    updatedPlayer: Partial<Player>,
  ) => ({
    teamId,
    idx,
    updatedPlayer,
  }),
  deletePlayer: (teamId: string, idx: number) => ({
    teamId,
    idx,
  }),
  addPlayer: (teamId: string) => ({ teamId }),
  toggleCycle: () => ({}),
  setImageSeconds: (imageSeconds: number) => ({ imageSeconds }),
  toggleAutoPlay: () => ({}),
  removeAssetAfterTimeout: () => ({}),
  showNextAsset: () => ({}),
  remoteRefresh: () => ({}),
  setPlaying: (playing: boolean) => ({ playing }),
  renderAsset: (asset: Asset | null) => ({ asset }),
  setSelectedAssets: (selectedAssets: Asset[]) => ({
    selectedAssets,
  }),
  addAssets: (assets: Asset[]) => ({ assets }),
  removeAsset: (asset: Asset) => ({ asset }),
  setAvailableMatches: (matches: AvailableMatches) => ({
    matches,
  }),
  updateClubRosterPlayer: (
    clubId: string,
    ksiId: string,
    player: ClubRosterPlayer,
  ) => ({ clubId, ksiId, player }),
  getAvailableMatches: (homeTeam: string, awayTeam: string) => {
    if (DEBUG) {
      return new Promise((resolve) => resolve(lambdaExample));
    }
    const options = {
      params: {
        homeTeam: clubIds[homeTeam as keyof typeof clubIds],
        awayTeam: clubIds[awayTeam as keyof typeof clubIds],
      },
    };
    return axios.get(`${apiConfig.gateWayUrl}match-report`, options);
  },
};

const actionCreators: Record<string, unknown> = {};

Object.keys(actionPayloads).forEach((key) => {
  const payloadFn = actionPayloads[key];
  actionCreators[key] = payloadFn
    ? createAction(key, payloadFn as (...args: never[]) => unknown)
    : createAction(key);
});

export default actionCreators as unknown as ActionCreators;
