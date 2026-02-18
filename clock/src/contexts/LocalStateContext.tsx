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

  // Remote settings
  listenPrefix: string;
  setListenPrefix: (prefix: string) => void;
  available: string[];

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

  const [available, setAvailable] = useState<string[]>([]);

  // Login Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Persist setters
  const setListenPrefix = (newPrefix: string) => {
    setListenPrefixState(newPrefix);
    localStorage.setItem(LISTEN_PREFIX_KEY, newPrefix);
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = firebaseAuth.onAuthStateChanged((user: User | null) => {
      const authState = firebaseAuth.userToAuthState(user);
      setAuth(authState);
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

        // If current listenPrefix is not in available, set to first available
        if (locations.length > 0 && !locations.includes(listenPrefix)) {
          setListenPrefix(locations[0]!);
        }
      } else {
        setAvailable([]);
      }
    });

    return () => {
      unsubscribe();
      setAvailable([]);
    };
  }, [auth.uid, listenPrefix]);

  const value = {
    auth,
    listenPrefix,
    setListenPrefix,
    available,
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
