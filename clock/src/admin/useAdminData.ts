import { useState, useEffect, useCallback } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { fetchUsers } from "./adminFunctions";

export interface AdminUser {
  uid: string;
  email: string | undefined;
  displayName: string | undefined;
  lastSignIn: string | undefined;
  createdAt: string;
  locations: Record<string, boolean>;
  disabled: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  locations: Record<string, boolean>;
  createdBy: string;
  createdAt: number;
}

export interface LocationDef {
  key: string;
  label: string;
}

interface AdminData {
  users: AdminUser[];
  invitations: Invitation[];
  locations: LocationDef[];
  loading: boolean;
  error: string | null;
  refreshUsers: () => void;
}

interface AuthMapping {
  [uid: string]: Record<string, boolean>;
}

interface RawInvitation {
  email?: string;
  locations?: Record<string, boolean>;
  createdBy?: string;
  createdAt?: number;
}

interface RawLocation {
  name?: string;
}

export function useAdminData(): AdminData {
  const [authUsers, setAuthUsers] = useState<
    Array<{
      uid: string;
      email: string | undefined;
      displayName: string | undefined;
      createdAt: string;
      lastSignIn: string | undefined;
      disabled: boolean;
    }>
  >([]);
  const [authMappings, setAuthMappings] = useState<AuthMapping>({});
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [locations, setLocations] = useState<LocationDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usersFetchCount, setUsersFetchCount] = useState(0);

  const refreshUsers = useCallback(() => {
    setLoading(true);
    setError(null);
    setUsersFetchCount((c) => c + 1);
  }, []);

  // Fetch Firebase Auth users via Cloud Function
  useEffect(() => {
    let cancelled = false;

    fetchUsers()
      .then((users) => {
        if (!cancelled) {
          setAuthUsers(users);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Villa við að sækja notendur";
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [usersFetchCount]);

  // Subscribe to auth/ in RTDB for user-screen mappings
  useEffect(() => {
    const authRef = ref(database, "auth");
    const unsubscribe = onValue(
      authRef,
      (snapshot) => {
        const data = snapshot.val() as Record<
          string,
          Record<string, boolean>
        > | null;
        if (data && typeof data === "object") {
          setAuthMappings(data);
        } else {
          setAuthMappings({});
        }
      },
      (err) => {
        setError(err.message);
      },
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to invitations/ in RTDB
  useEffect(() => {
    const invRef = ref(database, "invitations");
    const unsubscribe = onValue(
      invRef,
      (snapshot) => {
        const data = snapshot.val() as Record<string, RawInvitation> | null;
        if (data && typeof data === "object") {
          const parsed: Invitation[] = Object.entries(data)
            .map(([id, inv]) => ({
              id,
              email: inv.email ?? "",
              locations: inv.locations ?? {},
              createdBy: inv.createdBy ?? "",
              createdAt: inv.createdAt ?? 0,
            }))
            .sort((a, b) => b.createdAt - a.createdAt);
          setInvitations(parsed);
        } else {
          setInvitations([]);
        }
      },
      (err) => {
        setError(err.message);
      },
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to locations/ in RTDB
  useEffect(() => {
    const locRef = ref(database, "locations");
    const unsubscribe = onValue(
      locRef,
      (snapshot) => {
        const data = snapshot.val() as Record<string, RawLocation> | null;
        if (data && typeof data === "object") {
          const parsed: LocationDef[] = Object.entries(data).map(
            ([key, val]) => ({
              key,
              label:
                typeof val === "object" && val !== null && val.name
                  ? val.name
                  : key,
            }),
          );
          setLocations(parsed);
        } else {
          setLocations([]);
        }
      },
      (err) => {
        setError(err.message);
      },
    );
    return () => unsubscribe();
  }, []);

  // Merge Auth users with RTDB mappings
  const users: AdminUser[] = authUsers.map((u) => ({
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    lastSignIn: u.lastSignIn,
    createdAt: u.createdAt,
    locations: authMappings[u.uid] ?? {},
    disabled: u.disabled,
  }));

  return { users, invitations, locations, loading, error, refreshUsers };
}
