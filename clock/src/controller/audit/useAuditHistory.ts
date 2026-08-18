import { useCallback, useEffect, useMemo, useState } from "react";
import {
  query,
  ref,
  limitToLast,
  orderByChild,
  endAt,
  onValue,
  get,
} from "firebase/database";
import { database } from "../../firebase";
import { parseAuditEvents } from "../../contexts/firebaseParsers";
import type { AuditEvent } from "../../types";

// Bounded recent-event query: a venue's full history could be large, so only
// the newest events are fetched for inspection. Loading older history uses the
// same bound with the oldest visible timestamp as an inclusive cursor.
export const RECENT_EVENT_LIMIT = 50;

export interface AuditHistoryState {
  events: AuditEvent[];
  loading: boolean;
  error: string | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  loadOlder: () => void;
}

// Merges batches into a single newest-first list, deduplicating by Firebase
// event id so live updates and overlapping cursor batches never repeat rows.
const mergeNewestFirst = (...batches: AuditEvent[][]): AuditEvent[] => {
  const seen = new Set<string>();
  const merged: AuditEvent[] = [];
  for (const batch of batches) {
    for (const event of batch) {
      const key =
        event.id ?? `${event.timestamp}-${event.uid}-${event.sessionId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(event);
    }
  }
  merged.sort((a, b) => b.timestamp - a.timestamp);
  return merged;
};

// Subscribes to the newest audit events for a venue, newest first, and allows
// loading the next bounded batch older than the oldest visible event. Anonymous
// or unauthorized readers hit the read rule and surface a permission error
// rather than raw Firebase data. The subscription is only active while
// `enabled` is true (e.g. while the inspection modal is open) so closed UI
// never reads the audit tree.
export function useAuditHistory(
  location: string,
  enabled: boolean,
): AuditHistoryState {
  const [newest, setNewest] = useState<AuditEvent[]>([]);
  const [older, setOlder] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);

  const active = Boolean(enabled && location);

  // Reset subscription and pagination state whenever the active venue changes
  // or inspection closes. This uses the render-phase "adjust state" pattern
  // (not an effect) so there is never a stale snapshot shown while a fresh
  // subscription is pending.
  const [activeKey, setActiveKey] = useState("");
  const nextActiveKey = active ? location : "";
  if (nextActiveKey !== activeKey) {
    setActiveKey(nextActiveKey);
    setNewest([]);
    setOlder([]);
    setHasOlder(false);
    setLoadingOlder(false);
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
        setNewest(parsed);
        // A short batch means the bounded query reached the start of history.
        setHasOlder(parsed.length === RECENT_EVENT_LIMIT);
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

  const events = useMemo(
    () => mergeNewestFirst(newest, older),
    [newest, older],
  );

  const loadOlder = useCallback(() => {
    if (!active || loadingOlder || !hasOlder) return;
    const cursor = events[events.length - 1];
    if (!cursor) return;

    setLoadingOlder(true);
    const historyRef = query(
      ref(database, `audit/${location}`),
      orderByChild("timestamp"),
      // Inclusive cursor so records sharing the oldest visible timestamp are
      // not skipped; the cursor itself is removed by id after the fetch.
      endAt(cursor.timestamp),
      limitToLast(RECENT_EVENT_LIMIT),
    );

    void get(historyRef)
      .then((snapshot) => {
        const parsed = parseAuditEvents(snapshot.val());
        const knownIds = new Set(events.map((event) => event.id));
        const nextBatch = parsed
          .filter((event) => !knownIds.has(event.id))
          .sort((a, b) => b.timestamp - a.timestamp);
        setOlder((prev) => mergeNewestFirst(prev, nextBatch));
        setHasOlder(parsed.length === RECENT_EVENT_LIMIT);
      })
      .catch((error) => {
        console.error("Firebase audit history older-batch error:", error);
        setError("Gat ekki sótt eldri breytingasögu.");
      })
      .finally(() => {
        setLoadingOlder(false);
      });
  }, [active, location, events, hasOlder, loadingOlder]);

  if (!active) {
    return {
      events: [],
      loading: false,
      error: null,
      hasOlder: false,
      loadingOlder: false,
      loadOlder: () => undefined,
    };
  }

  return { events, loading, error, hasOlder, loadingOlder, loadOlder };
}
