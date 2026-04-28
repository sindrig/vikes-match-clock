import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";

/**
 * Subscribes to `presence/{listenPrefix}` and returns the number of
 * connected screens. Returns 0 when no listenPrefix is set.
 */
export default function useConnectedScreens(listenPrefix: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!listenPrefix) return;

    const presenceRef = ref(database, `presence/${listenPrefix}`);
    const unsubscribe = onValue(presenceRef, (snap) => {
      setCount(snap.exists() ? snap.size : 0);
    });

    return () => {
      unsubscribe();
      setCount(0);
    };
  }, [listenPrefix]);

  return count;
}
