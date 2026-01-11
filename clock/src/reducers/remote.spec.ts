import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import remoteReducer, { initialState } from "./remote";
import ActionTypes from "../ActionTypes";

const createAction = (type: string, payload?: unknown) => ({
  type,
  payload,
});

describe("remote reducer", () => {
  beforeEach(() => {
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      reload: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("returns the initial state", () => {
      const state = remoteReducer(undefined, { type: "@@INIT" });
      expect(state).toEqual(initialState);
    });

    it("has correct default values", () => {
      expect(initialState.email).toBe("");
      expect(initialState.password).toBe("");
      expect(initialState.sync).toBe(false);
      expect(initialState.listenPrefix).toBe("");
    });
  });

  describe("setEmail", () => {
    it("updates the email", () => {
      const state = remoteReducer(
        initialState,
        createAction(ActionTypes.setEmail, { email: "test@example.com" }),
      );

      expect(state.email).toBe("test@example.com");
    });
  });

  describe("setPassword", () => {
    it("updates the password", () => {
      const state = remoteReducer(
        initialState,
        createAction(ActionTypes.setPassword, { password: "secret123" }),
      );

      expect(state.password).toBe("secret123");
    });
  });

  describe("setSync", () => {
    it("enables sync", () => {
      const state = remoteReducer(
        initialState,
        createAction(ActionTypes.setSync, { sync: true }),
      );

      expect(state.sync).toBe(true);
    });

    it("disables sync", () => {
      const stateWithSync = { ...initialState, sync: true };

      const state = remoteReducer(
        stateWithSync,
        createAction(ActionTypes.setSync, { sync: false }),
      );

      expect(state.sync).toBe(false);
    });
  });

  describe("setListenPrefix", () => {
    it("updates the listen prefix", () => {
      const state = remoteReducer(
        initialState,
        createAction(ActionTypes.setListenPrefix, { listenPrefix: "viken" }),
      );

      expect(state.listenPrefix).toBe("viken");
    });

    it("triggers page reload when prefix changes", () => {
      vi.useFakeTimers();
      const stateWithPrefix = { ...initialState, listenPrefix: "old-prefix" };

      remoteReducer(
        stateWithPrefix,
        createAction(ActionTypes.setListenPrefix, {
          listenPrefix: "new-prefix",
        }),
      );

      vi.advanceTimersByTime(2000);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(window.location.reload).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("does not reload when prefix is the same", () => {
      vi.useFakeTimers();
      const stateWithPrefix = { ...initialState, listenPrefix: "same" };

      remoteReducer(
        stateWithPrefix,
        createAction(ActionTypes.setListenPrefix, { listenPrefix: "same" }),
      );

      vi.advanceTimersByTime(2000);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(window.location.reload).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe("receiveRemoteData for authData", () => {
    it("sets listenPrefix from available locations", () => {
      const authData = {
        viken: true,
        laugar: true,
        disabled: false,
      };

      const state = remoteReducer(initialState, {
        type: ActionTypes.receiveRemoteData,
        data: authData,
        storeAs: "authData",
      });

      expect(["viken", "laugar"]).toContain(state.listenPrefix);
    });

    it("keeps current prefix if still available", () => {
      const stateWithPrefix = { ...initialState, listenPrefix: "laugar" };
      const authData = {
        viken: true,
        laugar: true,
      };

      const state = remoteReducer(stateWithPrefix, {
        type: ActionTypes.receiveRemoteData,
        data: authData,
        storeAs: "authData",
      });

      expect(state.listenPrefix).toBe("laugar");
    });

    it("switches to available prefix if current is no longer valid", () => {
      const stateWithPrefix = { ...initialState, listenPrefix: "removed" };
      const authData = {
        viken: true,
        laugar: true,
      };

      const state = remoteReducer(stateWithPrefix, {
        type: ActionTypes.receiveRemoteData,
        data: authData,
        storeAs: "authData",
      });

      expect(["viken", "laugar"]).toContain(state.listenPrefix);
    });

    it("ignores non-authData stores", () => {
      const state = remoteReducer(initialState, {
        type: ActionTypes.receiveRemoteData,
        data: { listenPrefix: "should-not-set" },
        storeAs: "match",
      });

      expect(state.listenPrefix).toBe("");
    });
  });
});
