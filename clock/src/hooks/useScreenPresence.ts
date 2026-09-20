import { useEffect, useRef } from "react";
import {
  ref,
  push,
  set,
  update,
  onDisconnect,
  onValue,
  serverTimestamp,
  type DatabaseReference,
} from "firebase/database";
import { database } from "../firebase";

const ERROR_MESSAGE_LIMIT = 300;
const HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * Diagnostics the screen reports alongside its presence record: the label the
 * admin sees, the physical resolution, and the current renderer error
 * (null = healthy). Written on every connect and merged on every change.
 */
export interface ScreenPresenceDiagnostics {
  error: string | null;
  label: string;
  resolution: string;
}

const truncateError = (message: string): string =>
  message.length <= ERROR_MESSAGE_LIMIT
    ? message
    : message.slice(0, ERROR_MESSAGE_LIMIT);

const buildDiagnosticsPayload = (
  diagnostics: ScreenPresenceDiagnostics | undefined,
): Record<string, unknown> => {
  if (!diagnostics) return {};
  const payload: Record<string, unknown> = {};
  if (diagnostics.label) payload.label = diagnostics.label;
  if (diagnostics.resolution) payload.resolution = diagnostics.resolution;
  if (diagnostics.error) {
    payload.error = truncateError(diagnostics.error);
    payload.errorAt = serverTimestamp();
  }
  return payload;
};

/**
 * Reports this screen's presence to Firebase at `presence/{listenPrefix}/{connectionId}`.
 *
 * Uses Firebase's `.info/connected` to detect connection state and
 * `onDisconnect().remove()` to auto-cleanup on disconnect (clean or dirty).
 * Optional diagnostics (label/resolution/error) are written with the initial
 * presence payload and merged into the live record whenever they change, so
 * the controller can display per-screen renderer errors without a separate
 * writable path for unauthenticated displays.
 *
 * A `lastHeartbeat` server timestamp is refreshed once per minute while
 * connected so the controller can flag a screen whose browser is wedged
 * (presence still connected but the tab is no longer responsive).
 *
 * Should only be used by unauthenticated screen instances (not controllers).
 */
export default function useScreenPresence(
  listenPrefix: string,
  displayKind: "scoreboard" | "perimeter" = "scoreboard",
  diagnostics?: ScreenPresenceDiagnostics,
): void {
  const connectionRef = useRef<DatabaseReference | null>(null);
  const connectedRef = useRef(false);
  const diagnosticsRef = useRef<ScreenPresenceDiagnostics | undefined>(
    diagnostics,
  );

  useEffect(() => {
    diagnosticsRef.current = diagnostics;
  }, [diagnostics]);

  useEffect(() => {
    if (!listenPrefix) return;

    const connectedInfoRef = ref(database, ".info/connected");
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const unsubscribe = onValue(connectedInfoRef, (snap) => {
      if (snap.val() !== true) {
        // The node is removed server-side by the registered onDisconnect
        // handler; locally we just drop the reference and stop the heartbeat.
        connectedRef.current = false;
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        connectionRef.current = null;
        return;
      }

      connectedRef.current = true;
      const presenceRef = ref(database, `presence/${listenPrefix}`);
      const pushedRef = push(presenceRef);
      connectionRef.current = pushedRef;

      // Register cleanup BEFORE setting presence (avoids race condition)
      void onDisconnect(pushedRef).remove();

      void set(pushedRef, {
        connectedAt: serverTimestamp(),
        displayKind,
        ...buildDiagnosticsPayload(diagnosticsRef.current),
      });

      heartbeat = setInterval(() => {
        const target = connectionRef.current;
        if (!target || !connectedRef.current) return;
        void update(target, { lastHeartbeat: serverTimestamp() });
      }, HEARTBEAT_INTERVAL_MS);
    });

    return () => {
      unsubscribe();
      connectedRef.current = false;
      if (heartbeat) clearInterval(heartbeat);
      if (connectionRef.current) {
        void set(connectionRef.current, null);
        connectionRef.current = null;
      }
    };
  }, [listenPrefix, displayKind]);

  // Error changes are merged into the live presence record; a null error
  // clears the fields so the screen reports healthy again. While offline the
  // record does not exist, and the connect payload already carries the latest
  // error, so nothing is written here.
  useEffect(() => {
    const error = diagnostics?.error ?? null;
    const target = connectionRef.current;
    if (!target || !connectedRef.current) return;
    void update(
      target,
      error
        ? {
            error: truncateError(error),
            errorAt: serverTimestamp(),
          }
        : { error: null, errorAt: null },
    );
  }, [diagnostics?.error]);
}
