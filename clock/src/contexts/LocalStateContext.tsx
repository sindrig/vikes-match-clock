import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { User } from "firebase/auth";
import { ref, onValue } from "firebase/database";
import { firebaseAuth } from "../firebaseAuth";
import { database } from "../firebase";

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

  // Remote settings
  listenPrefix: string;
  setListenPrefix: (prefix: string) => void;
  available: string[] | null;

  // Screen key (from "Birta skjá" selection) — used to resolve viewport from live Firebase locations
  screenKey: string | null;
  setScreenKey: (key: string | null) => void;

  // Login form state
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
}

const LocalStateContext = createContext<LocalStateContextType | undefined>(
  undefined,
);

const LISTEN_PREFIX_KEY = "clock_listenPrefix";
const SCREEN_KEY_KEY = "clock_screenKey";

export function LocalStateProvider({ children }: { children: ReactNode }) {
  // Auth State
  const [auth, setAuth] = useState<FirebaseAuthState>({
    isLoaded: false,
    isEmpty: true,
  });

  // Remote Settings
  const [listenPrefix, setListenPrefixState] = useState<string>(() => {
    return localStorage.getItem(LISTEN_PREFIX_KEY) || "";
  });

  const [available, setAvailable] = useState<string[] | null>(null);

  // Admin state
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // Screen key (set when selecting a screen via "Birta skjá")
  const [screenKey, setScreenKeyState] = useState<string | null>(() => {
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
    setListenPrefixState(newPrefix);
    localStorage.setItem(LISTEN_PREFIX_KEY, newPrefix);
  };

  const setScreenKey = (key: string | null) => {
    setScreenKeyState(key);
    if (key) {
      localStorage.setItem(SCREEN_KEY_KEY, key);
    } else {
      localStorage.removeItem(SCREEN_KEY_KEY);
    }
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = firebaseAuth.onAuthStateChanged((user: User | null) => {
      const authState = firebaseAuth.userToAuthState(user);
      setAuth(authState);

      // Expose UID on window for E2E tests
      if (typeof window !== "undefined") {
        window.__firebaseAuthUID = authState.uid || null;
      }
    });
    return () => unsubscribe();
  }, []);

  // Available Locations Listener
  useEffect(() => {
    if (!auth.uid) {
      return;
    }

    const authRef = ref(database, `auth/${auth.uid}`);
    const unsubscribe = onValue(authRef, (snapshot) => {
      const data = snapshot.val() as Record<string, boolean> | null;
      if (data && typeof data === "object") {
        const locations = Object.entries(data)
          .filter(([, value]) => value === true)
          .map(([key]) => key);
        setAvailable(locations);
      } else {
        setAvailable([]);
      }
    });

    return () => {
      unsubscribe();
      setAvailable(null);
    };
  }, [auth.uid]);

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
    listenPrefix,
    setListenPrefix,
    available,
    screenKey,
    setScreenKey,
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
