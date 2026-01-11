import { describe, it, expect } from "vitest";
import listenersReducer, { initialState } from "./listeners";
import ActionTypes from "../ActionTypes";

const createAction = (storeAs: string, data: unknown) => ({
  type: ActionTypes.receiveRemoteData,
  storeAs,
  data,
});

describe("listeners reducer", () => {
  describe("initial state", () => {
    it("returns the initial state", () => {
      const state = listenersReducer(undefined, { type: "@@INIT" });
      expect(state).toEqual(initialState);
    });

    it("has correct default values", () => {
      expect(initialState.available).toEqual([]);
      expect(initialState.screens).toEqual([]);
    });
  });

  describe("receiveRemoteData with locations", () => {
    it("extracts available location keys from locations data", () => {
      const locationsData = {
        viken: { label: "Víkin", screens: [], pitchIds: [] },
        laugar: { label: "Laugar", screens: [], pitchIds: [] },
      };

      const state = listenersReducer(
        initialState,
        createAction("locations", locationsData),
      );

      expect(state.available).toEqual(["viken", "laugar"]);
    });

    it("flattens screens from all locations", () => {
      const locationsData = {
        viken: {
          label: "Víkin",
          screens: [{ name: "Main" }, { name: "Secondary" }],
          pitchIds: ["pitch1"],
        },
        laugar: {
          label: "Laugar",
          screens: [{ name: "Display" }],
          pitchIds: ["pitch2"],
        },
      };

      const state = listenersReducer(
        initialState,
        createAction("locations", locationsData),
      );

      expect(state.screens).toHaveLength(3);
      expect(state.screens[0]).toEqual({
        screen: { name: "Main" },
        label: "Víkin",
        key: "viken",
        pitchIds: ["pitch1"],
      });
      expect(state.screens[1]).toEqual({
        screen: { name: "Secondary" },
        label: "Víkin",
        key: "viken",
        pitchIds: ["pitch1"],
      });
      expect(state.screens[2]).toEqual({
        screen: { name: "Display" },
        label: "Laugar",
        key: "laugar",
        pitchIds: ["pitch2"],
      });
    });

    it("handles empty locations data", () => {
      const state = listenersReducer(
        initialState,
        createAction("locations", {}),
      );

      expect(state.available).toEqual([]);
      expect(state.screens).toEqual([]);
    });

    it("handles location with no screens", () => {
      const locationsData = {
        viken: { label: "Víkin", screens: [], pitchIds: [] },
      };

      const state = listenersReducer(
        initialState,
        createAction("locations", locationsData),
      );

      expect(state.available).toEqual(["viken"]);
      expect(state.screens).toEqual([]);
    });
  });

  describe("receiveRemoteData with authData", () => {
    it("extracts available locations from authData where value is true", () => {
      const authData = {
        viken: true,
        laugar: true,
        kopavogur: false,
      };

      const state = listenersReducer(
        initialState,
        createAction("authData", authData),
      );

      expect(state.available).toEqual(["viken", "laugar"]);
    });

    it("returns empty available when all authData values are false", () => {
      const authData = {
        viken: false,
        laugar: false,
      };

      const state = listenersReducer(
        initialState,
        createAction("authData", authData),
      );

      expect(state.available).toEqual([]);
    });

    it("does not modify screens when receiving authData", () => {
      const existingState = {
        available: ["old"],
        screens: [{ screen: {}, label: "Test", key: "test", pitchIds: [] }],
      };

      const state = listenersReducer(
        existingState,
        createAction("authData", { viken: true }),
      );

      expect(state.screens).toEqual(existingState.screens);
    });
  });

  describe("receiveRemoteData with other storeAs values", () => {
    it("returns unchanged state for unknown storeAs", () => {
      const state = listenersReducer(
        initialState,
        createAction("unknown", { some: "data" }),
      );

      expect(state).toEqual(initialState);
    });

    it("returns unchanged state for null data", () => {
      const state = listenersReducer(
        initialState,
        createAction("locations", null),
      );

      expect(state).toEqual(initialState);
    });

    it("returns unchanged state for non-object data", () => {
      const state = listenersReducer(
        initialState,
        createAction("locations", "string"),
      );

      expect(state).toEqual(initialState);
    });
  });
});
