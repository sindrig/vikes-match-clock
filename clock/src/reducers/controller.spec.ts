import { describe, it, expect } from "vitest";
import controllerReducer, {
  initialState,
  VIEWS,
  ASSET_VIEWS,
  TABS,
} from "./controller";
import ActionTypes from "../ActionTypes";
import type { ControllerState, Asset } from "../types";

const createAction = (type: string, payload?: unknown) => ({
  type,
  payload,
});

describe("controller reducer", () => {
  describe("initial state", () => {
    it("returns the initial state", () => {
      const state = controllerReducer(undefined, { type: "@@INIT" });
      expect(state).toEqual(initialState);
    });

    it("has correct default values", () => {
      expect(initialState.selectedAssets).toEqual([]);
      expect(initialState.cycle).toBe(false);
      expect(initialState.imageSeconds).toBe(3);
      expect(initialState.autoPlay).toBe(false);
      expect(initialState.playing).toBe(false);
      expect(initialState.assetView).toBe(ASSET_VIEWS.assets);
      expect(initialState.view).toBe(VIEWS.idle);
      expect(initialState.currentAsset).toBeNull();
    });
  });

  describe("view and tab selection", () => {
    describe("selectView", () => {
      it("changes the current view", () => {
        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.selectView, { view: VIEWS.match }),
        );

        expect(state.view).toBe(VIEWS.match);
      });

      it("can set view to control", () => {
        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.selectView, { view: VIEWS.control }),
        );

        expect(state.view).toBe(VIEWS.control);
      });
    });

    describe("selectAssetView", () => {
      it("changes the asset view", () => {
        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.selectAssetView, {
            assetView: ASSET_VIEWS.teams,
          }),
        );

        expect(state.assetView).toBe(ASSET_VIEWS.teams);
      });
    });

    describe("selectTab", () => {
      it("changes the active tab", () => {
        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.selectTab, { tab: TABS.settings }),
        );

        expect(state.tab).toBe(TABS.settings);
      });
    });
  });

  describe("asset queue management", () => {
    describe("addAssets", () => {
      it("adds assets to the queue", () => {
        const assets: Asset[] = [
          { key: "asset-1", type: "IMAGE" },
          { key: "asset-2", type: "IMAGE" },
        ];

        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.addAssets, { assets }),
        );

        expect(state.selectedAssets).toHaveLength(2);
        expect(state.selectedAssets[0].key).toBe("asset-1");
      });

      it("prevents duplicate assets by key", () => {
        const stateWithAsset: ControllerState = {
          ...initialState,
          selectedAssets: [{ key: "asset-1", type: "IMAGE" }],
        };

        const state = controllerReducer(
          stateWithAsset,
          createAction(ActionTypes.addAssets, {
            assets: [{ key: "asset-1", type: "IMAGE" }],
          }),
        );

        expect(state.selectedAssets).toHaveLength(1);
      });

      it("ignores assets with invalid types", () => {
        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.addAssets, {
            assets: [{ key: "asset-1", type: "invalid-type" }],
          }),
        );

        expect(state.selectedAssets).toHaveLength(0);
      });

      it("ignores assets without keys", () => {
        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.addAssets, {
            assets: [{ key: "", type: "IMAGE" }],
          }),
        );

        expect(state.selectedAssets).toHaveLength(0);
      });
    });

    describe("removeAsset", () => {
      it("removes an asset by key", () => {
        const stateWithAssets: ControllerState = {
          ...initialState,
          selectedAssets: [
            { key: "asset-1", type: "IMAGE" },
            { key: "asset-2", type: "IMAGE" },
          ],
        };

        const state = controllerReducer(
          stateWithAssets,
          createAction(ActionTypes.removeAsset, {
            asset: { key: "asset-1", type: "IMAGE" },
          }),
        );

        expect(state.selectedAssets).toHaveLength(1);
        expect(state.selectedAssets[0].key).toBe("asset-2");
      });

      it("does nothing if asset not found", () => {
        const stateWithAssets: ControllerState = {
          ...initialState,
          selectedAssets: [{ key: "asset-1", type: "IMAGE" }],
        };

        const state = controllerReducer(
          stateWithAssets,
          createAction(ActionTypes.removeAsset, {
            asset: { key: "nonexistent", type: "IMAGE" },
          }),
        );

        expect(state.selectedAssets).toHaveLength(1);
      });
    });

    describe("setSelectedAssets", () => {
      it("replaces the entire asset queue", () => {
        const stateWithAssets: ControllerState = {
          ...initialState,
          selectedAssets: [{ key: "old", type: "IMAGE" }],
        };

        const newAssets: Asset[] = [
          { key: "new-1", type: "IMAGE" },
          { key: "new-2", type: "VIDEO" },
        ];

        const state = controllerReducer(
          stateWithAssets,
          createAction(ActionTypes.setSelectedAssets, {
            selectedAssets: newAssets,
          }),
        );

        expect(state.selectedAssets).toEqual(newAssets);
      });

      it("handles null/undefined by setting empty array", () => {
        const stateWithAssets: ControllerState = {
          ...initialState,
          selectedAssets: [{ key: "asset", type: "IMAGE" }],
        };

        const state = controllerReducer(
          stateWithAssets,
          createAction(ActionTypes.setSelectedAssets, { selectedAssets: null }),
        );

        expect(state.selectedAssets).toEqual([]);
      });
    });
  });

  describe("asset display", () => {
    describe("renderAsset", () => {
      it("sets the current asset", () => {
        const asset: Asset = { key: "asset-1", type: "IMAGE" };

        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.renderAsset, { asset }),
        );

        expect(state.currentAsset).toEqual({ asset, time: null });
      });

      it("clears the current asset when null", () => {
        const stateWithAsset: ControllerState = {
          ...initialState,
          currentAsset: {
            asset: { key: "asset-1", type: "IMAGE" },
            time: null,
          },
        };

        const state = controllerReducer(
          stateWithAsset,
          createAction(ActionTypes.renderAsset, { asset: null }),
        );

        expect(state.currentAsset).toBeNull();
      });
    });

    describe("showNextAsset", () => {
      it("shows the next asset in queue", () => {
        const stateWithAssets: ControllerState = {
          ...initialState,
          selectedAssets: [
            { key: "asset-1", type: "IMAGE" },
            { key: "asset-2", type: "IMAGE" },
          ],
        };

        const state = controllerReducer(
          stateWithAssets,
          createAction(ActionTypes.showNextAsset),
        );

        expect(state.currentAsset?.asset.key).toBe("asset-1");
        expect(state.selectedAssets).toHaveLength(1);
        expect(state.selectedAssets[0].key).toBe("asset-2");
      });

      it("clears currentAsset when queue is empty", () => {
        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.showNextAsset),
        );

        expect(state.currentAsset).toBeNull();
        expect(state.playing).toBe(false);
      });

      it("cycles asset back to queue when cycle is enabled", () => {
        const stateWithCycle: ControllerState = {
          ...initialState,
          cycle: true,
          selectedAssets: [{ key: "asset-1", type: "IMAGE" }],
        };

        const state = controllerReducer(
          stateWithCycle,
          createAction(ActionTypes.showNextAsset),
        );

        expect(state.currentAsset?.asset.key).toBe("asset-1");
        expect(state.selectedAssets).toHaveLength(1);
        expect(state.selectedAssets[0].key).toBe("asset-1");
      });

      it("sets time when autoPlay is enabled", () => {
        const stateWithAutoPlay: ControllerState = {
          ...initialState,
          autoPlay: true,
          imageSeconds: 5,
          selectedAssets: [{ key: "asset-1", type: "IMAGE" }],
        };

        const state = controllerReducer(
          stateWithAutoPlay,
          createAction(ActionTypes.showNextAsset),
        );

        expect(state.currentAsset?.time).toBe(5);
        expect(state.playing).toBe(true);
      });
    });

    describe("removeAssetAfterTimeout", () => {
      it("shows next asset when autoPlay and playing", () => {
        const stateAutoPlaying: ControllerState = {
          ...initialState,
          autoPlay: true,
          playing: true,
          selectedAssets: [{ key: "asset-1", type: "IMAGE" }],
          currentAsset: {
            asset: { key: "current", type: "IMAGE" },
            time: 3,
          },
        };

        const state = controllerReducer(
          stateAutoPlaying,
          createAction(ActionTypes.removeAssetAfterTimeout),
        );

        expect(state.currentAsset?.asset.key).toBe("asset-1");
      });

      it("clears currentAsset when not autoPlay", () => {
        const stateWithAsset: ControllerState = {
          ...initialState,
          autoPlay: false,
          currentAsset: {
            asset: { key: "current", type: "IMAGE" },
            time: 3,
          },
        };

        const state = controllerReducer(
          stateWithAsset,
          createAction(ActionTypes.removeAssetAfterTimeout),
        );

        expect(state.currentAsset).toBeNull();
      });

      it("does nothing when autoPlay but not playing", () => {
        const stateNotPlaying: ControllerState = {
          ...initialState,
          autoPlay: true,
          playing: false,
          currentAsset: {
            asset: { key: "current", type: "IMAGE" },
            time: 3,
          },
        };

        const state = controllerReducer(
          stateNotPlaying,
          createAction(ActionTypes.removeAssetAfterTimeout),
        );

        expect(state.currentAsset?.asset.key).toBe("current");
      });
    });
  });

  describe("playback controls", () => {
    describe("toggleCycle", () => {
      it("toggles cycle from false to true", () => {
        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.toggleCycle),
        );

        expect(state.cycle).toBe(true);
      });

      it("toggles cycle from true to false", () => {
        const stateWithCycle: ControllerState = { ...initialState, cycle: true };

        const state = controllerReducer(
          stateWithCycle,
          createAction(ActionTypes.toggleCycle),
        );

        expect(state.cycle).toBe(false);
      });
    });

    describe("setImageSeconds", () => {
      it("sets the image display duration", () => {
        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.setImageSeconds, { imageSeconds: 10 }),
        );

        expect(state.imageSeconds).toBe(10);
      });
    });

    describe("toggleAutoPlay", () => {
      it("toggles autoPlay from false to true", () => {
        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.toggleAutoPlay),
        );

        expect(state.autoPlay).toBe(true);
      });

      it("stops playing when disabling autoPlay", () => {
        const stateAutoPlaying: ControllerState = {
          ...initialState,
          autoPlay: true,
          playing: true,
        };

        const state = controllerReducer(
          stateAutoPlaying,
          createAction(ActionTypes.toggleAutoPlay),
        );

        expect(state.autoPlay).toBe(false);
        expect(state.playing).toBe(false);
      });
    });

    describe("setPlaying", () => {
      it("sets playing state", () => {
        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.setPlaying, { playing: true }),
        );

        expect(state.playing).toBe(true);
      });
    });
  });

  describe("match selection", () => {
    describe("selectMatch", () => {
      it("selects a match by ID", () => {
        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.selectMatch, "12345"),
        );

        expect(state.selectedMatch).toBe(12345);
      });

      it("ignores invalid match IDs", () => {
        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.selectMatch, "not-a-number"),
        );

        expect(state.selectedMatch).toBeNull();
      });
    });

    describe("clearMatchPlayers", () => {
      it("clears available matches and selection", () => {
        const stateWithMatches: ControllerState = {
          ...initialState,
          availableMatches: { "123": { players: {} } },
          selectedMatch: "123",
        };

        const state = controllerReducer(
          stateWithMatches,
          createAction(ActionTypes.clearMatchPlayers),
        );

        expect(state.availableMatches).toEqual({});
        expect(state.selectedMatch).toBeNull();
      });
    });

    describe("setAvailableMatches", () => {
      it("sets available matches and selects first one", () => {
        const matches = {
          "100": { players: {} },
          "200": { players: {} },
        };

        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.setAvailableMatches, { matches }),
        );

        expect(state.availableMatches).toEqual(matches);
        expect(state.selectedMatch).toBe("100");
      });

      it("handles empty matches", () => {
        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.setAvailableMatches, { matches: {} }),
        );

        expect(state.availableMatches).toEqual({});
        expect(state.selectedMatch).toBeNull();
      });
    });
  });

  describe("player management", () => {
    const stateWithMatch: ControllerState = {
      ...initialState,
      selectedMatch: "123",
      availableMatches: {
        "123": {
          players: {
            home: [
              { name: "Player 1", number: "10", show: true, role: "starter" },
            ],
            away: [{ name: "Player 2", number: "7", show: false, role: "sub" }],
          },
        },
      },
    };

    describe("addPlayer", () => {
      it("adds an empty player to the team", () => {
        const state = controllerReducer(
          stateWithMatch,
          createAction(ActionTypes.addPlayer, { teamId: "home" }),
        );

        const players =
          state.availableMatches["123"].players["home"];
        expect(players).toHaveLength(2);
        expect(players[1]).toEqual({
          name: "",
          number: "",
          show: false,
          role: "",
        });
      });

      it("creates player array if team has none", () => {
        const stateNoPlayers: ControllerState = {
          ...initialState,
          selectedMatch: "123",
          availableMatches: {
            "123": { players: {} },
          },
        };

        const state = controllerReducer(
          stateNoPlayers,
          createAction(ActionTypes.addPlayer, { teamId: "home" }),
        );

        expect(
          state.availableMatches["123"].players["home"],
        ).toHaveLength(1);
      });

      it("does nothing if no match selected", () => {
        const state = controllerReducer(
          initialState,
          createAction(ActionTypes.addPlayer, { teamId: "home" }),
        );

        expect(state).toEqual(initialState);
      });
    });

    describe("editPlayer", () => {
      it("updates player properties", () => {
        const state = controllerReducer(
          stateWithMatch,
          createAction(ActionTypes.editPlayer, {
            teamId: "home",
            idx: 0,
            updatedPlayer: { name: "Updated Name", number: "99" },
          }),
        );

        const player =
          state.availableMatches["123"].players["home"][0];
        expect(player.name).toBe("Updated Name");
        expect(player.number).toBe("99");
        expect(player.role).toBe("starter");
      });
    });

    describe("deletePlayer", () => {
      it("removes a player by index", () => {
        const state = controllerReducer(
          stateWithMatch,
          createAction(ActionTypes.deletePlayer, { teamId: "home", idx: 0 }),
        );

        expect(
          state.availableMatches["123"].players["home"],
        ).toHaveLength(0);
      });
    });
  });

  describe("remote data", () => {
    describe("receiveRemoteData", () => {
      it("merges remote controller data", () => {
        const remoteData = {
          cycle: true,
          imageSeconds: 10,
        };

        const state = controllerReducer(initialState, {
          type: ActionTypes.receiveRemoteData,
          data: remoteData,
          storeAs: "controller",
        });

        expect(state.cycle).toBe(true);
        expect(state.imageSeconds).toBe(10);
      });

      it("ignores data for other stores", () => {
        const state = controllerReducer(initialState, {
          type: ActionTypes.receiveRemoteData,
          data: { cycle: true },
          storeAs: "match",
        });

        expect(state.cycle).toBe(false);
      });

      it("clears selectedAssets when not in remote data", () => {
        const stateWithAssets: ControllerState = {
          ...initialState,
          selectedAssets: [{ key: "asset", type: "IMAGE" }],
        };

        const state = controllerReducer(stateWithAssets, {
          type: ActionTypes.receiveRemoteData,
          data: { cycle: true },
          storeAs: "controller",
        });

        expect(state.selectedAssets).toEqual([]);
      });

      it("clears currentAsset when not in remote data", () => {
        const stateWithAsset: ControllerState = {
          ...initialState,
          currentAsset: { asset: { key: "a", type: "IMAGE" }, time: null },
        };

        const state = controllerReducer(stateWithAsset, {
          type: ActionTypes.receiveRemoteData,
          data: { cycle: true },
          storeAs: "controller",
        });

        expect(state.currentAsset).toBeNull();
      });
    });
  });

  describe("remoteRefresh", () => {
    it("generates a new refresh token", () => {
      const state = controllerReducer(
        initialState,
        createAction(ActionTypes.remoteRefresh),
      );

      expect(state.refreshToken).not.toBe("");
      expect(state.refreshToken.length).toBeGreaterThan(0);
    });

    it("generates different tokens each time", () => {
      const state1 = controllerReducer(
        initialState,
        createAction(ActionTypes.remoteRefresh),
      );
      const state2 = controllerReducer(
        state1,
        createAction(ActionTypes.remoteRefresh),
      );

      expect(state1.refreshToken).not.toBe(state2.refreshToken);
    });
  });
});
