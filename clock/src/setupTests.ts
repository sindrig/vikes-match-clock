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

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
}));

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({})),
  signInWithEmailAndPassword: vi.fn(() => Promise.resolve({ user: null })),
  signInWithPopup: vi.fn(() => Promise.resolve({ user: null })),
  signOut: vi.fn(() => Promise.resolve()),
  onAuthStateChanged: vi.fn((_auth, callback) => {
    callback(null);
    return () => {};
  }),
  GoogleAuthProvider: vi.fn(),
}));

vi.mock("firebase/database", () => ({
  getDatabase: vi.fn(() => ({})),
  ref: vi.fn(),
  onValue: vi.fn(() => () => {}),
  set: vi.fn(),
}));

vi.mock("firebase/storage", () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(() => ({ fullPath: "test/path" })),
  uploadBytes: vi.fn(() => Promise.resolve({})),
  uploadString: vi.fn(() => Promise.resolve({})),
  getDownloadURL: vi.fn(() => Promise.resolve("https://example.com/test.png")),
  listAll: vi.fn(() =>
    Promise.resolve({
      items: [],
      prefixes: [],
    }),
  ),
  deleteObject: vi.fn(() => Promise.resolve()),
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
