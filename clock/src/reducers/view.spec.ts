import { describe, it, expect } from "vitest";
import viewReducer, { initialState, BACKGROUNDS, getBackground } from "./view";
import ActionTypes from "../ActionTypes";

const createAction = (type: string, payload?: unknown) => ({
  type,
  payload,
});

describe("view reducer", () => {
  describe("initial state", () => {
    it("returns the initial state", () => {
      const state = viewReducer(undefined, { type: "@@INIT" });
      expect(state).toEqual(initialState);
    });

    it("has correct default values", () => {
      expect(initialState.background).toBe("Vikes 2024");
      expect(initialState.idleImage).toBe("Víkingur R");
      expect(initialState.vp.fontSize).toBe("100%");
      expect(initialState.vp.style.height).toBe(176);
      expect(initialState.vp.style.width).toBe(240);
    });
  });

  describe("setBackground", () => {
    it("changes the background", () => {
      const state = viewReducer(
        initialState,
        createAction(ActionTypes.setBackground, { background: "Svart" }),
      );

      expect(state.background).toBe("Svart");
    });

    it("preserves other state", () => {
      const state = viewReducer(
        initialState,
        createAction(ActionTypes.setBackground, { background: "CL" }),
      );

      expect(state.idleImage).toBe("Víkingur R");
      expect(state.vp).toEqual(initialState.vp);
    });
  });

  describe("setIdleImage", () => {
    it("changes the idle image", () => {
      const state = viewReducer(
        initialState,
        createAction(ActionTypes.setIdleImage, { idleImage: "Breiðablik" }),
      );

      expect(state.idleImage).toBe("Breiðablik");
    });
  });

  describe("setViewPort", () => {
    it("updates viewport settings", () => {
      const newVp = {
        fontSize: "150%",
        style: { height: 352, width: 480 },
      };

      const state = viewReducer(
        initialState,
        createAction(ActionTypes.setViewPort, { vp: newVp }),
      );

      expect(state.vp).toEqual(newVp);
    });
  });

  describe("receiveRemoteData", () => {
    it("merges remote view data", () => {
      const remoteData = {
        background: "Iceland",
        idleImage: "KR",
      };

      const state = viewReducer(initialState, {
        type: ActionTypes.receiveRemoteData,
        data: remoteData,
        storeAs: "view",
      });

      expect(state.background).toBe("Iceland");
      expect(state.idleImage).toBe("KR");
    });

    it("preserves local viewport on remote sync", () => {
      const customVp = {
        fontSize: "200%",
        style: { height: 500, width: 700 },
      };
      const stateWithCustomVp = { ...initialState, vp: customVp };

      const state = viewReducer(stateWithCustomVp, {
        type: ActionTypes.receiveRemoteData,
        data: {
          background: "CL",
          vp: { fontSize: "50%", style: { height: 100, width: 100 } },
        },
        storeAs: "view",
      });

      expect(state.vp).toEqual(customVp);
      expect(state.background).toBe("CL");
    });

    it("ignores data for other stores", () => {
      const state = viewReducer(initialState, {
        type: ActionTypes.receiveRemoteData,
        data: { background: "CL" },
        storeAs: "match",
      });

      expect(state.background).toBe("Vikes 2024");
    });
  });

  describe("getBackground helper", () => {
    it("returns the correct background style", () => {
      const bg = getBackground("Svart");
      expect(bg.backgroundColor).toBe("black");
    });

    it("returns default background for unknown keys", () => {
      const bg = getBackground("nonexistent");
      expect(bg).toEqual(BACKGROUNDS["Vikes 2024"]);
    });

    it("returns CL background", () => {
      const bg = getBackground("CL");
      expect(bg.backgroundImage).toContain("url(");
    });
  });

  describe("BACKGROUNDS constant", () => {
    it("contains expected background options", () => {
      expect(BACKGROUNDS["Vikes 2024"]).toBeDefined();
      expect(BACKGROUNDS["Svart"]).toBeDefined();
      expect(BACKGROUNDS["CL"]).toBeDefined();
      expect(BACKGROUNDS["Iceland"]).toBeDefined();
      expect(BACKGROUNDS["Ukraine"]).toBeDefined();
    });
  });
});
