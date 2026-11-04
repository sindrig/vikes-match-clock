import {
  createContext,
  useCallback,
  useRef,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { User } from "firebase/auth";
import { ref, onValue } from "firebase/database";
import { firebaseAuth } from "../firebaseAuth";
import { database } from "../firebase";
import type { DisplayTarget } from "../types";
import { MutationSession } from "../lib/mutationSession";
import { useSubscriptionRead, type ReadStatus } from "./subscriptionRead";

export interface FirebaseAuthState {
  isLoaded: boolean;
  isEmpty: boolean;
  uid?: string;
  email?: string | null;
}

interface LocalStateContextType {
  // Auth state
  auth: FirebaseAuthState;
  isAdmin: boolean;
  mutationSession: MutationSession;
  logout: () => Promise<void>;

  // Remote settings
  listenPrefix: string;
  setListenPrefix: (prefix: string) => void;
  available: string[] | null;
  availableStatus: ReadStatus;
  retryAvailable: () => void;

  // Screen key (from "Birta skjá" selection) — used to resolve viewport from live Firebase locations
  screenKey: string | null;
  setScreenKey: (key: string | null) => void;
  displayTarget: DisplayTarget | null;
  setDisplayTarget: (target: DisplayTarget | null) => void;

  // Login form state
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
}

const LocalStateContext = createContext<LocalStateContextType | undefined>(
  undefined,
);

const emptyGrants: string[] = [];
const parseGrants = (raw: unknown): string[] =>
  raw && typeof raw === "object"
    ? Object.entries(raw)
        .filter(([, value]) => value === true)
        .map(([key]) => key)
    : [];

const LISTEN_PREFIX_KEY = "clock_listenPrefix";
const SCREEN_KEY_KEY = "clock_screenKey";
const DISPLAY_TARGET_KEY = "clock_displayTarget";

function parseStoredDisplayTarget(value: string | null): DisplayTarget | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      "kind" in parsed &&
      parsed.kind === "perimeter"
    ) {
      return { kind: "perimeter" };
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      "kind" in parsed &&
      parsed.kind === "scoreboard" &&
      "screenKey" in parsed &&
      typeof parsed.screenKey === "string" &&
      parsed.screenKey.length > 0
    ) {
      return { kind: "scoreboard", screenKey: parsed.screenKey };
    }
  } catch {
    // A malformed local value should behave like a fresh display.
  }
  return null;
}

function getInitialDisplayTarget(): DisplayTarget | null {
  const stored = parseStoredDisplayTarget(
    localStorage.getItem(DISPLAY_TARGET_KEY),
  );
  if (stored) return stored;

  const storedScreenKey = localStorage.getItem(SCREEN_KEY_KEY);
  if (storedScreenKey) {
    const target = { kind: "scoreboard", screenKey: storedScreenKey } as const;
    localStorage.setItem(DISPLAY_TARGET_KEY, JSON.stringify(target));
    return target;
  }

  const oldViewport = localStorage.getItem("clock_screenViewport");
  if (oldViewport) {
    try {
      const parsed = JSON.parse(oldViewport) as { key?: string };
      if (parsed.key) {
        const target = { kind: "scoreboard", screenKey: parsed.key } as const;
        localStorage.setItem(DISPLAY_TARGET_KEY, JSON.stringify(target));
        localStorage.setItem(SCREEN_KEY_KEY, parsed.key);
        localStorage.removeItem("clock_screenViewport");
        return target;
      }
    } catch {
      // Ignore legacy parse errors.
    }
  }
  return null;
}

export function LocalStateProvider({ children }: { children: ReactNode }) {
  // Auth State
  const [auth, setAuth] = useState<FirebaseAuthState>({
    isLoaded: false,
    isEmpty: true,
  });

  // Remote Settings
  const [listenPrefix, setListenPrefixState] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlPrefix = urlParams.get("prefix");
    if (urlPrefix) {
      localStorage.setItem(LISTEN_PREFIX_KEY, urlPrefix);
      return urlPrefix;
    }
    return localStorage.getItem(LISTEN_PREFIX_KEY) || "";
  });

  const [authReadScope, setAuthReadScope] = useState(() => ({}));
  const authReadScopeRef = useRef(authReadScope);
  const [mutationSession] = useState(
    () =>
      new MutationSession(
        { location: listenPrefix, authenticated: false },
        () => firebaseAuth.getCurrentUser()?.uid,
      ),
  );

  const grantsCurrent = useCallback(
    () =>
      authReadScopeRef.current === authReadScope &&
      mutationSession.getSnapshot().authenticated &&
      mutationSession.getSnapshot().uid === auth.uid,
    [authReadScope, mutationSession, auth.uid],
  );
  const grants = useSubscriptionRead({
    scope: authReadScope,
    path: `auth/${auth.uid}`,
    area: "aðgang að skjám",
    initial: emptyGrants,
    parse: parseGrants,
    isCurrent: grantsCurrent,
    enabled: Boolean(auth.uid),
    clearOnError: true,
  });
  const available = grants.status.phase === "ready" ? grants.value : null;

  // Admin state
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const [displayTarget, setDisplayTargetState] = useState<DisplayTarget | null>(
    getInitialDisplayTarget,
  );

  // Screen key (set when selecting a scoreboard via "Birta skjá")
  const [screenKey, setScreenKeyState] = useState<string | null>(() => {
    const target = parseStoredDisplayTarget(
      localStorage.getItem(DISPLAY_TARGET_KEY),
    );
    if (target?.kind === "scoreboard") return target.screenKey;
    if (target?.kind === "perimeter") return null;
    const stored = localStorage.getItem(SCREEN_KEY_KEY);
    if (stored) return stored;

    // Migration: extract key from old screenViewport localStorage format
    const oldViewport = localStorage.getItem("clock_screenViewport");
    if (oldViewport) {
      try {
        const parsed = JSON.parse(oldViewport) as { key?: string };
        if (parsed.key) {
          localStorage.setItem(SCREEN_KEY_KEY, parsed.key);
          localStorage.removeItem("clock_screenViewport");
          return parsed.key;
        }
      } catch {
        // ignore parse errors
      }
    }
    return null;
  });

  // Login Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Persist setters
  const setListenPrefix = (newPrefix: string) => {
    mutationSession.setLocation(newPrefix);
    setListenPrefixState(newPrefix);
    localStorage.setItem(LISTEN_PREFIX_KEY, newPrefix);
  };

  const logout = (): Promise<void> => {
    mutationSession.setAuth(false);
    authReadScopeRef.current = {};
    setAuthReadScope(authReadScopeRef.current);
    return firebaseAuth.logout().catch((error: unknown) => {
      // A failed sign-out must not revive old commands or leave the still
      // authenticated operator permanently locked out. Re-enter via a new
      // subscription scope using the SDK's actual user.
      const user = firebaseAuth.getCurrentUser();
      mutationSession.setAuth(Boolean(user), user?.uid);
      authReadScopeRef.current = {};
      setAuthReadScope(authReadScopeRef.current);
      throw error;
    });
  };

  const setDisplayTarget = (target: DisplayTarget | null) => {
    setDisplayTargetState(target);
    if (target) {
      localStorage.setItem(DISPLAY_TARGET_KEY, JSON.stringify(target));
    } else {
      localStorage.removeItem(DISPLAY_TARGET_KEY);
    }

    const scoreboardKey =
      target?.kind === "scoreboard" ? target.screenKey : null;
    setScreenKeyState(scoreboardKey);
    if (scoreboardKey) {
      localStorage.setItem(SCREEN_KEY_KEY, scoreboardKey);
    } else {
      localStorage.removeItem(SCREEN_KEY_KEY);
    }
  };

  const setScreenKey = (key: string | null) => {
    setDisplayTarget(key ? { kind: "scoreboard", screenKey: key } : null);
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = firebaseAuth.onAuthStateChanged((user: User | null) => {
      const authState = firebaseAuth.userToAuthState(user);
      mutationSession.setAuth(!authState.isEmpty, authState.uid);
      authReadScopeRef.current = {};
      setAuthReadScope(authReadScopeRef.current);
      setAuth(authState);

      // Expose UID on window for E2E tests
      if (typeof window !== "undefined") {
        window.__firebaseAuthUID = authState.uid || null;
      }
    });
    return () => unsubscribe();
  }, [mutationSession]);

  // Admin Listener
  useEffect(() => {
    if (!auth.uid) {
      return () => {
        setIsAdmin(false);
      };
    }
    const adminRef = ref(database, `admins/${auth.uid}`);
    const unsubscribe = onValue(adminRef, (snapshot) => {
      setIsAdmin(snapshot.val() === true);
    });
    return () => {
      unsubscribe();
      setIsAdmin(false);
    };
  }, [auth.uid]);

  const value = {
    auth,
    isAdmin,
    mutationSession,
    logout,
    listenPrefix,
    setListenPrefix,
    available,
    availableStatus: grants.status,
    retryAvailable: grants.retry,
    screenKey,
    setScreenKey,
    displayTarget,
    setDisplayTarget,
    email,
    setEmail,
    password,
    setPassword,
  };

  return (
    <LocalStateContext.Provider value={value}>
      {children}
    </LocalStateContext.Provider>
  );
}

export function useLocalState() {
  const context = useContext(LocalStateContext);
  if (context === undefined) {
    throw new Error("useLocalState must be used within a LocalStateProvider");
  }
  return context;
}

export function useAuth() {
  const { auth } = useLocalState();
  return auth;
}

export function useRemoteSettings() {
  const { listenPrefix, setListenPrefix, available } = useLocalState();
  return { listenPrefix, setListenPrefix, available };
}

export function useIsAdmin() {
  const { isAdmin } = useLocalState();
  return isAdmin;
}
