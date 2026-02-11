import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import {
  LocalStateProvider,
  useLocalState,
  useAuth,
  useRemoteSettings,
  FirebaseAuthState,
} from "./LocalStateContext";

vi.mock("../firebaseAuth", () => ({
  firebaseAuth: {
    onAuthStateChanged: vi.fn((callback: (u: null) => void) => {
      callback(null);
      return vi.fn();
    }),
    userToAuthState: vi.fn((user: null | { uid?: string; email?: string }) => {
      if (user === null) {
        return { isLoaded: true, isEmpty: true };
      }
      return {
        isLoaded: true,
        isEmpty: false,
        uid: user.uid,
        email: user.email,
      };
    }),
  },
}));

vi.mock("../firebase", () => ({
  database: {},
}));

vi.mock("firebase/database", () => ({
  ref: vi.fn(),
  onValue: vi.fn(() => vi.fn()),
}));

const TestLocalStateConsumer = ({
  onMount,
}: {
  onMount: (api: ReturnType<typeof useLocalState>) => void;
}) => {
  const localStateApi = useLocalState();
  React.useEffect(() => {
    onMount(localStateApi);
  }, [localStateApi, onMount]);
  return <div data-testid="consumer">Consumer</div>;
};

const TestAuthConsumer = ({
  onMount,
}: {
  onMount: (auth: FirebaseAuthState) => void;
}) => {
  const auth = useAuth();
  React.useEffect(() => {
    onMount(auth);
  }, [auth, onMount]);
  return <div data-testid="auth-consumer">Auth Consumer</div>;
};

const TestRemoteSettingsConsumer = ({
  onMount,
}: {
  onMount: (settings: ReturnType<typeof useRemoteSettings>) => void;
}) => {
  const settings = useRemoteSettings();
  React.useEffect(() => {
    onMount(settings);
  }, [settings, onMount]);
  return <div data-testid="settings-consumer">Settings Consumer</div>;
};

describe("LocalStateContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("initialization", () => {
    it("initializes with default auth state when no user", () => {
      let authState: FirebaseAuthState | null = null;

      render(
        <LocalStateProvider>
          <TestAuthConsumer
            onMount={(auth) => {
              authState = auth;
            }}
          />
        </LocalStateProvider>,
      );

      expect(authState).not.toBeNull();
      expect(authState!.isLoaded).toBe(true);
      expect(authState!.isEmpty).toBe(true);
      expect(authState!.uid).toBeUndefined();
      expect(authState!.email).toBeUndefined();
    });

    it("initializes sync from localStorage with default false", () => {
      let api: ReturnType<typeof useLocalState> | null = null;

      render(
        <LocalStateProvider>
          <TestLocalStateConsumer
            onMount={(localStateApi) => {
              api = localStateApi;
            }}
          />
        </LocalStateProvider>,
      );

      expect(api).not.toBeNull();
      expect(api!.sync).toBe(false);
    });

    it("initializes listenPrefix from localStorage with default empty string", () => {
      let api: ReturnType<typeof useLocalState> | null = null;

      render(
        <LocalStateProvider>
          <TestLocalStateConsumer
            onMount={(localStateApi) => {
              api = localStateApi;
            }}
          />
        </LocalStateProvider>,
      );

      expect(api).not.toBeNull();
      expect(api!.listenPrefix).toBe("");
    });

    it("initializes available as empty array", () => {
      let api: ReturnType<typeof useLocalState> | null = null;

      render(
        <LocalStateProvider>
          <TestLocalStateConsumer
            onMount={(localStateApi) => {
              api = localStateApi;
            }}
          />
        </LocalStateProvider>,
      );

      expect(api).not.toBeNull();
      expect(api!.available).toEqual([]);
    });

    it("initializes email and password as empty strings", () => {
      let api: ReturnType<typeof useLocalState> | null = null;

      render(
        <LocalStateProvider>
          <TestLocalStateConsumer
            onMount={(localStateApi) => {
              api = localStateApi;
            }}
          />
        </LocalStateProvider>,
      );

      expect(api).not.toBeNull();
      expect(api!.email).toBe("");
      expect(api!.password).toBe("");
    });
  });

  describe("localStorage persistence", () => {
    it("loads sync state from localStorage on mount", () => {
      localStorage.setItem("clock_sync", "true");

      let api: ReturnType<typeof useLocalState> | null = null;

      render(
        <LocalStateProvider>
          <TestLocalStateConsumer
            onMount={(localStateApi) => {
              api = localStateApi;
            }}
          />
        </LocalStateProvider>,
      );

      expect(api).not.toBeNull();
      expect(api!.sync).toBe(true);
    });

    it("loads listenPrefix from localStorage on mount", () => {
      localStorage.setItem("clock_listenPrefix", "test-location");

      let api: ReturnType<typeof useLocalState> | null = null;

      render(
        <LocalStateProvider>
          <TestLocalStateConsumer
            onMount={(localStateApi) => {
              api = localStateApi;
            }}
          />
        </LocalStateProvider>,
      );

      expect(api).not.toBeNull();
      expect(api!.listenPrefix).toBe("test-location");
    });

    it("setSync persists to localStorage", () => {
      let api: ReturnType<typeof useLocalState> | null = null;

      render(
        <LocalStateProvider>
          <TestLocalStateConsumer
            onMount={(localStateApi) => {
              api = localStateApi;
            }}
          />
        </LocalStateProvider>,
      );

      expect(api).not.toBeNull();

      act(() => {
        api!.setSync(true);
      });

      expect(api!.sync).toBe(true);
      expect(localStorage.getItem("clock_sync")).toBe("true");
    });

    it("setListenPrefix persists to localStorage", () => {
      let api: ReturnType<typeof useLocalState> | null = null;

      render(
        <LocalStateProvider>
          <TestLocalStateConsumer
            onMount={(localStateApi) => {
              api = localStateApi;
            }}
          />
        </LocalStateProvider>,
      );

      expect(api).not.toBeNull();

      act(() => {
        api!.setListenPrefix("new-location");
      });

      expect(api!.listenPrefix).toBe("new-location");
      expect(localStorage.getItem("clock_listenPrefix")).toBe("new-location");
    });

    it("setSync(false) persists 'false' string to localStorage", () => {
      localStorage.setItem("clock_sync", "true");

      let api: ReturnType<typeof useLocalState> | null = null;

      render(
        <LocalStateProvider>
          <TestLocalStateConsumer
            onMount={(localStateApi) => {
              api = localStateApi;
            }}
          />
        </LocalStateProvider>,
      );

      expect(api).not.toBeNull();

      act(() => {
        api!.setSync(false);
      });

      expect(api!.sync).toBe(false);
      expect(localStorage.getItem("clock_sync")).toBe("false");
    });

    it("setListenPrefix with empty string persists empty string", () => {
      localStorage.setItem("clock_listenPrefix", "location");

      let api: ReturnType<typeof useLocalState> | null = null;

      render(
        <LocalStateProvider>
          <TestLocalStateConsumer
            onMount={(localStateApi) => {
              api = localStateApi;
            }}
          />
        </LocalStateProvider>,
      );

      expect(api).not.toBeNull();

      act(() => {
        api!.setListenPrefix("");
      });

      expect(api!.listenPrefix).toBe("");
      expect(localStorage.getItem("clock_listenPrefix")).toBe("");
    });
  });

  describe("auth state transformation", () => {
    it("transforms null user to isEmpty: true", () => {
      let authState: FirebaseAuthState | null = null;

      render(
        <LocalStateProvider>
          <TestAuthConsumer
            onMount={(auth) => {
              authState = auth;
            }}
          />
        </LocalStateProvider>,
      );

      expect(authState).not.toBeNull();
      expect(authState!.isEmpty).toBe(true);
      expect(authState!.uid).toBeUndefined();
      expect(authState!.email).toBeUndefined();
    });

    it("calls userToAuthState with user from onAuthStateChanged", () => {
      let authState: FirebaseAuthState | null = null;

      render(
        <LocalStateProvider>
          <TestAuthConsumer
            onMount={(auth) => {
              authState = auth;
            }}
          />
        </LocalStateProvider>,
      );

      expect(authState).not.toBeNull();
      expect(authState!.isLoaded).toBe(true);
    });
  });

  describe("login form state", () => {
    it("setEmail updates email state", () => {
      let api: ReturnType<typeof useLocalState> | null = null;

      render(
        <LocalStateProvider>
          <TestLocalStateConsumer
            onMount={(localStateApi) => {
              api = localStateApi;
            }}
          />
        </LocalStateProvider>,
      );

      expect(api).not.toBeNull();

      act(() => {
        api!.setEmail("user@example.com");
      });

      expect(api!.email).toBe("user@example.com");
    });

    it("setPassword updates password state", () => {
      let api: ReturnType<typeof useLocalState> | null = null;

      render(
        <LocalStateProvider>
          <TestLocalStateConsumer
            onMount={(localStateApi) => {
              api = localStateApi;
            }}
          />
        </LocalStateProvider>,
      );

      expect(api).not.toBeNull();

      act(() => {
        api!.setPassword("mypassword123");
      });

      expect(api!.password).toBe("mypassword123");
    });
  });

  describe("useAuth hook", () => {
    it("useAuth returns only auth state", () => {
      let authState: FirebaseAuthState | null = null;

      render(
        <LocalStateProvider>
          <TestAuthConsumer
            onMount={(auth) => {
              authState = auth;
            }}
          />
        </LocalStateProvider>,
      );

      expect(authState).not.toBeNull();
      expect(authState!.isLoaded).toBe(true);
      expect(authState!.isEmpty).toBe(true);
      expect(Object.keys(authState!).sort()).toEqual(
        ["isLoaded", "isEmpty"].sort(),
      );
    });

      it("throws error when used outside LocalStateProvider", () => {
        const ThrowingComponent = () => {
          useAuth();
          return null;
        };

        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
          // Suppress console errors for this test
        });

        expect(() => {
          render(<ThrowingComponent />);
        }).toThrow("useLocalState must be used within a LocalStateProvider");

        consoleError.mockRestore();
      });
  });

  describe("useRemoteSettings hook", () => {
    it("useRemoteSettings returns only remote settings", () => {
      let settings: ReturnType<typeof useRemoteSettings> | null = null;

      render(
        <LocalStateProvider>
          <TestRemoteSettingsConsumer
            onMount={(remoteSettings) => {
              settings = remoteSettings;
            }}
          />
        </LocalStateProvider>,
      );

      expect(settings).not.toBeNull();
      expect(settings!.sync).toBe(false);
      expect(settings!.listenPrefix).toBe("");
      expect(settings!.available).toEqual([]);
      expect(typeof settings!.setSync).toBe("function");
      expect(typeof settings!.setListenPrefix).toBe("function");
    });

      it("throws error when used outside LocalStateProvider", () => {
        const ThrowingComponent = () => {
          useRemoteSettings();
          return null;
        };

        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
          // Suppress console errors for this test
        });

        expect(() => {
          render(<ThrowingComponent />);
        }).toThrow("useLocalState must be used within a LocalStateProvider");

        consoleError.mockRestore();
      });

    it("allows setting remote settings values", () => {
      let settings: ReturnType<typeof useRemoteSettings> | null = null;

      render(
        <LocalStateProvider>
          <TestRemoteSettingsConsumer
            onMount={(remoteSettings) => {
              settings = remoteSettings;
            }}
          />
        </LocalStateProvider>,
      );

      expect(settings).not.toBeNull();

      act(() => {
        settings!.setSync(true);
        settings!.setListenPrefix("test-location");
      });

      expect(settings!.sync).toBe(true);
      expect(settings!.listenPrefix).toBe("test-location");
    });
  });

  describe("useLocalState hook", () => {
      it("throws error when used outside LocalStateProvider", () => {
        const ThrowingComponent = () => {
          useLocalState();
          return null;
        };

        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
          // Suppress console errors for this test
        });

        expect(() => {
          render(<ThrowingComponent />);
        }).toThrow("useLocalState must be used within a LocalStateProvider");

        consoleError.mockRestore();
      });

    it("returns full context API", () => {
      let api: ReturnType<typeof useLocalState> | null = null;

      render(
        <LocalStateProvider>
          <TestLocalStateConsumer
            onMount={(localStateApi) => {
              api = localStateApi;
            }}
          />
        </LocalStateProvider>,
      );

      expect(api).not.toBeNull();
      expect(api!.auth).toBeDefined();
      expect(api!.sync).toBe(false);
      expect(api!.setSync).toBeDefined();
      expect(api!.listenPrefix).toBe("");
      expect(api!.setListenPrefix).toBeDefined();
      expect(api!.available).toEqual([]);
      expect(api!.email).toBe("");
      expect(api!.setEmail).toBeDefined();
      expect(api!.password).toBe("");
      expect(api!.setPassword).toBeDefined();
    });
  });
});
