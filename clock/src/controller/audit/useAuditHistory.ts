import { useEffect, useState } from "react";
import {
  query,
  ref,
  limitToLast,
  orderByChild,
  onValue,
} from "firebase/database";
import { database } from "../../firebase";
import { parseAuditEvents } from "../../contexts/firebaseParsers";
import type { AuditEvent } from "../../types";

// Bounded recent-event query: a venue's full history could be large, so only
// the newest events are fetched for inspection.
export const RECENT_EVENT_LIMIT = 50;

export interface AuditHistoryState {
  events: AuditEvent[];
  loading: boolean;
  error: string | null;
}

// Subscribes to the newest audit events for a venue, newest first. Anonymous or
// unauthorized readers hit the read rule and surface a permission error rather
// than raw Firebase data. The subscription is only active while `enabled` is
// true (e.g. while the inspection modal is open) so closed UI never reads the
// audit tree.
export function useAuditHistory(
  location: string,
  enabled: boolean,
): AuditHistoryState {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const active = Boolean(enabled && location);

  // Reset subscription state whenever the active venue changes. This uses the
  // render-phase "adjust state" pattern (not an effect) so there is never a
  // stale snapshot shown while a fresh subscription is pending.
  const [activeKey, setActiveKey] = useState("");
  const nextActiveKey = active ? location : "";
  if (nextActiveKey !== activeKey) {
    setActiveKey(nextActiveKey);
    setEvents([]);
    setError(null);
    setLoading(true);
  }

  useEffect(() => {
    if (!active) return;

    const historyRef = query(
      ref(database, `audit/${location}`),
      orderByChild("timestamp"),
      limitToLast(RECENT_EVENT_LIMIT),
    );

    const unsubscribe = onValue(
      historyRef,
      (snapshot) => {
        const parsed = parseAuditEvents(snapshot.val());
        parsed.sort((a, b) => b.timestamp - a.timestamp);
        setEvents(parsed);
        setLoading(false);
      },
      (error) => {
        console.error("Firebase audit history subscription error:", error);
        setError("Gat ekki sótt breytingasögu (heimild gæti vantað).");
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [active, location]);

  if (!active) {
    return { events: [], loading: false, error: null };
  }

  return { events, loading, error };
}
