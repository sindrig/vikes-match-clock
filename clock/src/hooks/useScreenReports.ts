import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";

/**
 * One connected screen's diagnostics as written by `useScreenPresence` at
 * `presence/{listenPrefix}/{connectionId}`. All fields beyond `connectedAt`
 * are optional and default to empty/zero for legacy records.
 */
export interface ScreenReportEntry {
  connectionId: string;
  displayKind: string;
  label: string;
  resolution: string;
  error: string;
  errorAt: number;
  connectedAt: number;
  lastHeartbeat: number;
}

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

const asNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export const parseScreenReportEntry = (
  connectionId: string,
  raw: unknown,
): ScreenReportEntry | null => {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.connectedAt !== "number") return null;
  return {
    connectionId,
    displayKind: asString(record.displayKind) || "scoreboard",
    label: asString(record.label),
    resolution: asString(record.resolution),
    error: asString(record.error),
    errorAt: asNumber(record.errorAt),
    connectedAt: record.connectedAt,
    lastHeartbeat: asNumber(record.lastHeartbeat),
  };
};

/**
 * Subscribes to `presence/{listenPrefix}` and returns one entry per currently
 * connected screen, sorted by label. Returns an empty list when no
 * listenPrefix is set.
 */
export default function useScreenReports(
  listenPrefix: string,
): ScreenReportEntry[] {
  const [entries, setEntries] = useState<ScreenReportEntry[]>([]);

  useEffect(() => {
    if (!listenPrefix) {
      return () => {
        setEntries([]);
      };
    }

    const reportsRef = ref(database, `presence/${listenPrefix}`);
    const unsubscribe = onValue(reportsRef, (snapshot) => {
      const raw: unknown = snapshot.val();
      const list: ScreenReportEntry[] = [];
      if (raw && typeof raw === "object") {
        for (const [connectionId, value] of Object.entries(
          raw as Record<string, unknown>,
        )) {
          const entry = parseScreenReportEntry(connectionId, value);
          if (entry) list.push(entry);
        }
      }
      list.sort((a, b) =>
        (a.label || a.connectionId).localeCompare(b.label || b.connectionId),
      );
      setEntries(list);
    });

    return () => {
      unsubscribe();
      setEntries([]);
    };
  }, [listenPrefix]);

  return entries;
}
