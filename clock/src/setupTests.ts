import "@testing-library/jest-dom/vitest";
import React from "react";
import { vi } from "vitest";

vi.mock("./lib/weather", () => ({
  getTemp: () => new Promise((resolve) => resolve(10)),
}));

vi.mock("redux-actions", () => ({
  createAction: (type: string) => (payload: unknown) => ({ type, payload }),
  handleActions:
    (
      handlers: Record<
        string,
        { next?: (state: unknown, action: unknown) => unknown }
      >,
      initialState: unknown,
    ) =>
    (state = initialState, action: { type: string }) => {
      const handler = handlers[action.type];
      if (handler && handler.next) {
        return handler.next(state, action);
      }
      return state;
    },
}));

vi.mock("axios", () => ({
  get: vi.fn(() => Promise.resolve({ data: {} })),
  post: vi.fn(() => Promise.resolve({ data: {} })),
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock("compress.js", () => {
  const MockCompress = function (this: {
    compress: () => Promise<{ data: string }[]>;
  }) {
    this.compress = () => Promise.resolve([{ data: "mock" }]);
  };
  return { default: MockCompress };
});

vi.mock("react-drag-drop-files", () => ({
  FileUploader: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("react-redux-firebase", () => ({
  useFirebaseConnect: vi.fn(),
  useFirebase: vi.fn(() => ({
    login: vi.fn(),
    logout: vi.fn(),
    auth: vi.fn(),
  })),
  isLoaded: vi.fn(() => true),
  isEmpty: vi.fn(() => true),
  ReactReduxFirebaseProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  firebaseReducer: (state = {}) => state,
  withFirebase:
    <P extends object>(Component: React.ComponentType<P>) =>
    (props: P) =>
      React.createElement(Component, { ...props, firebase: {} } as P),
}));

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
}));

vi.mock("firebase/database", () => ({
  getDatabase: vi.fn(() => ({})),
  ref: vi.fn(),
  onValue: vi.fn(),
  set: vi.fn(),
}));

vi.mock("firebase/storage", () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}));

vi.mock("hls.js", () => {
  const MockHls = function (this: {
    loadSource: () => void;
    attachMedia: () => void;
    on: () => void;
    destroy: () => void;
  }) {
    this.loadSource = vi.fn();
    this.attachMedia = vi.fn();
    this.on = vi.fn();
    this.destroy = vi.fn();
  };
  (MockHls as unknown as { isSupported: () => boolean }).isSupported = () =>
    true;
  return { default: MockHls };
});
