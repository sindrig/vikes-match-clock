import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import configureStore from "redux-mock-store";
import { useFirebaseSync, useFirebaseAuthListener } from "./useFirebaseSync";
import { initialState as matchInitialState } from "../reducers/match";
import { initialState as controllerInitialState } from "../reducers/controller";
import { initialState as viewInitialState } from "../reducers/view";
import { initialState as remoteInitialState } from "../reducers/remote";
import { initialState as authInitialState } from "../reducers/auth";
import { initialState as listenersInitialState } from "../reducers/listeners";
import { RemoteActionType } from "../ActionTypes";
import type { RootState } from "../types";

type OnValueCallback = (snapshot: { val: () => unknown }) => void;
type OnValueErrorCallback = (error: Error) => void;

const mockOnValue = vi.fn();
const mockRef = vi.fn();
const mockSyncState = vi.fn();

vi.mock("firebase/database", () => ({
  ref: (...args: unknown[]) => mockRef(...args) as unknown,
  onValue: (
    dbRef: unknown,
    callback: OnValueCallback,
    errorCallback?: OnValueErrorCallback,
  ) => mockOnValue(dbRef, callback, errorCallback) as () => void,
  set: vi.fn(),
  off: vi.fn(),
}));

vi.mock("../firebase", () => ({
  database: { fake: "database" },
}));

vi.mock("../firebaseDatabase", () => ({
  firebaseDatabase: {
    syncState: (...args: unknown[]) => mockSyncState(...args) as Promise<void>,
  },
}));

const mockStore = configureStore([]);

const createMockState = (overrides: Partial<RootState> = {}): RootState => ({
  match: matchInitialState,
  controller: controllerInitialState,
  view: viewInitialState,
  remote: remoteInitialState,
  auth: authInitialState,
  listeners: listenersInitialState,
  ...overrides,
});

function createWrapper(store: ReturnType<typeof mockStore>) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }
  Wrapper.displayName = "TestWrapper";
  return Wrapper;
}

const noop = () => {
  /* intentionally empty */
};

interface ActionWithType {
  type: string;
  storeAs?: string;
}

const RECEIVE_REMOTE_DATA = RemoteActionType.RECEIVE_REMOTE_DATA as string;

describe("useFirebaseSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnValue.mockReturnValue(noop);
    mockSyncState.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Firebase listeners setup", () => {
    it("sets up Firebase listeners when sync is enabled and listenPrefix is set", () => {
      const state = createMockState({
        remote: { ...remoteInitialState, sync: true, listenPrefix: "viken" },
      });
      const store = mockStore(state);

      renderHook(() => useFirebaseSync(), {
        wrapper: createWrapper(store),
      });

      expect(mockRef).toHaveBeenCalledWith(
        { fake: "database" },
        "states/viken/match",
      );
      expect(mockRef).toHaveBeenCalledWith(
        { fake: "database" },
        "states/viken/controller",
      );
      expect(mockRef).toHaveBeenCalledWith(
        { fake: "database" },
        "states/viken/view",
      );
      expect(mockRef).toHaveBeenCalledWith({ fake: "database" }, "locations");
    });

    it("does not set up state listeners when sync is disabled", () => {
      const state = createMockState({
        remote: { ...remoteInitialState, sync: false, listenPrefix: "viken" },
      });
      const store = mockStore(state);

      renderHook(() => useFirebaseSync(), {
        wrapper: createWrapper(store),
      });

      expect(mockRef).not.toHaveBeenCalledWith(
        { fake: "database" },
        "states/viken/match",
      );
      expect(mockRef).toHaveBeenCalledWith({ fake: "database" }, "locations");
    });

    it("does not set up state listeners when listenPrefix is empty", () => {
      const state = createMockState({
        remote: { ...remoteInitialState, sync: true, listenPrefix: "" },
      });
      const store = mockStore(state);

      renderHook(() => useFirebaseSync(), {
        wrapper: createWrapper(store),
      });

      expect(mockRef).not.toHaveBeenCalledWith(
        { fake: "database" },
        expect.stringContaining("states/"),
      );
    });

    it("cleans up listeners on unmount", () => {
      const unsubscribeMock = vi.fn();
      mockOnValue.mockReturnValue(unsubscribeMock);

      const state = createMockState({
        remote: { ...remoteInitialState, sync: true, listenPrefix: "viken" },
      });
      const store = mockStore(state);

      const { unmount } = renderHook(() => useFirebaseSync(), {
        wrapper: createWrapper(store),
      });

      unmount();

      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });

  describe("Remote Firebase changes update local Redux", () => {
    it("dispatches RECEIVE_REMOTE_DATA when match data arrives from Firebase", async () => {
      const state = createMockState({
        remote: { ...remoteInitialState, sync: true, listenPrefix: "viken" },
      });
      const store = mockStore(state);

      mockOnValue.mockImplementation(
        (_dbRef: unknown, callback: OnValueCallback) => {
          setTimeout(() => {
            callback({ val: () => ({ homeScore: 2, awayScore: 1 }) });
          }, 0);
          return noop;
        },
      );

      renderHook(() => useFirebaseSync(), {
        wrapper: createWrapper(store),
      });

      await waitFor(() => {
        const actions = store.getActions() as ActionWithType[];
        const remoteAction = actions.find(
          (a) => a.type === RECEIVE_REMOTE_DATA,
        );
        expect(remoteAction).toBeDefined();
      });
    });

    it("dispatches RECEIVE_REMOTE_DATA for locations data", async () => {
      const state = createMockState();
      const store = mockStore(state);

      mockOnValue.mockImplementation(
        (_dbRef: unknown, callback: OnValueCallback) => {
          setTimeout(() => {
            callback({ val: () => ({ viken: "Víkin", laugar: "Laugar" }) });
          }, 0);
          return noop;
        },
      );

      renderHook(() => useFirebaseSync(), {
        wrapper: createWrapper(store),
      });

      await waitFor(() => {
        const actions = store.getActions() as ActionWithType[];
        const locationsAction = actions.find(
          (a) => a.type === RECEIVE_REMOTE_DATA && a.storeAs === "locations",
        );
        expect(locationsAction).toBeDefined();
      });
    });

    it("does not dispatch when Firebase returns null data", async () => {
      const state = createMockState({
        remote: { ...remoteInitialState, sync: true, listenPrefix: "viken" },
      });
      const store = mockStore(state);

      mockOnValue.mockImplementation(
        (_dbRef: unknown, callback: OnValueCallback) => {
          setTimeout(() => {
            callback({ val: () => null });
          }, 0);
          return noop;
        },
      );

      renderHook(() => useFirebaseSync(), {
        wrapper: createWrapper(store),
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const actions = store.getActions() as ActionWithType[];
      const remoteActions = actions.filter(
        (a) => a.type === RECEIVE_REMOTE_DATA,
      );
      expect(remoteActions.length).toBe(0);
    });
  });

  describe("Sync toggle prevents writes when disabled", () => {
    it("does not sync when sync is disabled", () => {
      const state = createMockState({
        remote: { ...remoteInitialState, sync: false, listenPrefix: "viken" },
        auth: { isLoaded: true, isEmpty: false, uid: "test-uid" },
      });
      const store = mockStore(state);

      renderHook(() => useFirebaseSync(), {
        wrapper: createWrapper(store),
      });

      expect(mockSyncState).not.toHaveBeenCalled();
    });

    it("does not sync when not authenticated", () => {
      const state = createMockState({
        remote: { ...remoteInitialState, sync: true, listenPrefix: "viken" },
        auth: { isLoaded: true, isEmpty: true },
      });
      const store = mockStore(state);

      renderHook(() => useFirebaseSync(), {
        wrapper: createWrapper(store),
      });

      expect(mockSyncState).not.toHaveBeenCalled();
    });

    it("does not sync when listenPrefix is empty", () => {
      const state = createMockState({
        remote: { ...remoteInitialState, sync: true, listenPrefix: "" },
        auth: { isLoaded: true, isEmpty: false, uid: "test-uid" },
      });
      const store = mockStore(state);

      renderHook(() => useFirebaseSync(), {
        wrapper: createWrapper(store),
      });

      expect(mockSyncState).not.toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    it("handles Firebase listener errors gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);

      const state = createMockState({
        remote: { ...remoteInitialState, sync: true, listenPrefix: "viken" },
      });
      const store = mockStore(state);

      mockOnValue.mockImplementation(
        (
          _dbRef: unknown,
          _callback: OnValueCallback,
          errorCallback?: OnValueErrorCallback,
        ) => {
          if (errorCallback) {
            setTimeout(() => {
              errorCallback(new Error("Connection failed"));
            }, 0);
          }
          return noop;
        },
      );

      renderHook(() => useFirebaseSync(), {
        wrapper: createWrapper(store),
      });

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Firebase listener error"),
          expect.any(Error),
        );
      });

      consoleSpy.mockRestore();
    });
  });
});

describe("useFirebaseAuthListener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnValue.mockReturnValue(noop);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets up auth listener when uid is present", () => {
    const state = createMockState({
      auth: { isLoaded: true, isEmpty: false, uid: "test-user-123" },
    });
    const store = mockStore(state);

    renderHook(() => useFirebaseAuthListener(), {
      wrapper: createWrapper(store),
    });

    expect(mockRef).toHaveBeenCalledWith(
      { fake: "database" },
      "auth/test-user-123",
    );
  });

  it("does not set up auth listener when uid is not present", () => {
    const state = createMockState({
      auth: { isLoaded: true, isEmpty: true },
    });
    const store = mockStore(state);

    renderHook(() => useFirebaseAuthListener(), {
      wrapper: createWrapper(store),
    });

    expect(mockRef).not.toHaveBeenCalledWith(
      { fake: "database" },
      expect.stringContaining("auth/"),
    );
  });

  it("dispatches RECEIVE_REMOTE_DATA with authData when Firebase returns data", async () => {
    const state = createMockState({
      auth: { isLoaded: true, isEmpty: false, uid: "test-user-123" },
    });
    const store = mockStore(state);

    mockOnValue.mockImplementation(
      (_dbRef: unknown, callback: OnValueCallback) => {
        setTimeout(() => {
          callback({ val: () => ({ viken: true, laugar: true }) });
        }, 0);
        return noop;
      },
    );

    renderHook(() => useFirebaseAuthListener(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      const actions = store.getActions() as ActionWithType[];
      const authDataAction = actions.find(
        (a) => a.type === RECEIVE_REMOTE_DATA && a.storeAs === "authData",
      );
      expect(authDataAction).toBeDefined();
    });
  });

  it("cleans up auth listener on unmount", () => {
    const unsubscribeMock = vi.fn();
    mockOnValue.mockReturnValue(unsubscribeMock);

    const state = createMockState({
      auth: { isLoaded: true, isEmpty: false, uid: "test-user-123" },
    });
    const store = mockStore(state);

    const { unmount } = renderHook(() => useFirebaseAuthListener(), {
      wrapper: createWrapper(store),
    });

    unmount();

    expect(unsubscribeMock).toHaveBeenCalled();
  });
});
