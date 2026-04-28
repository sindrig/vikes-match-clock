import { useEffect } from "react";
import {
  ref,
  push,
  set,
  onDisconnect,
  onValue,
  serverTimestamp,
} from "firebase/database";
import { database } from "../firebase";

/**
 * Reports this screen's presence to Firebase at `presence/{listenPrefix}/{connectionId}`.
 *
 * Uses Firebase's `.info/connected` to detect connection state and
 * `onDisconnect().remove()` to auto-cleanup on disconnect (clean or dirty).
 *
 * Should only be used by unauthenticated screen instances (not controllers).
 */
export default function useScreenPresence(listenPrefix: string): void {
  useEffect(() => {
    if (!listenPrefix) return;

    const connectedRef = ref(database, ".info/connected");
    let connectionRef: ReturnType<typeof push> | null = null;

    const unsubscribe = onValue(connectedRef, (snap) => {
      if (snap.val() !== true) return;

      const presenceRef = ref(database, `presence/${listenPrefix}`);
      connectionRef = push(presenceRef);

      // Register cleanup BEFORE setting presence (avoids race condition)
      void onDisconnect(connectionRef).remove();

      void set(connectionRef, { connectedAt: serverTimestamp() });
    });

    return () => {
      unsubscribe();
      if (connectionRef) {
        void set(connectionRef, null);
      }
    };
  }, [listenPrefix]);
}
