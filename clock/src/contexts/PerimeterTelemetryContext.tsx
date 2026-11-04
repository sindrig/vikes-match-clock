import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import { MutationSession } from "../lib/mutationSession";
import { parsePerimeterBrightnessStatus } from "./firebaseParsers";
import {
  readFailure,
  useSubscriptionRead,
  type ReadStatus,
} from "./subscriptionRead";
import type { PerimeterBrightnessStatus } from "../types";

interface TelemetryValue {
  brightnessStatus: PerimeterBrightnessStatus | null;
  status: ReadStatus;
  retry: () => void;
}

const TelemetryContext = createContext<TelemetryValue | null>(null);

export function PerimeterTelemetryProvider({
  children,
  session,
  scope,
  location,
  authenticated,
  uid,
  connected,
  connection,
  isConnectionCurrent,
}: {
  children: ReactNode;
  session: MutationSession;
  scope: object;
  location: string;
  authenticated: boolean;
  uid?: string;
  connected: boolean;
  connection: object;
  isConnectionCurrent: (connection: object) => boolean;
}) {
  // A connection drop clears the visible report, independently of the match
  // recovery policy. Reattachment can only publish this venue's own SDK read.
  const readScope = useMemo(
    () => ({ scope, location, authenticated, uid, connected, connection }),
    [scope, location, authenticated, uid, connected, connection],
  );
  const isCurrent = useCallback(() => {
    const current = session.getSnapshot();
    return (
      isConnectionCurrent(connection) &&
      current.scope === scope &&
      current.location === location &&
      current.authenticated === authenticated &&
      current.uid === uid
    );
  }, [
    session,
    scope,
    location,
    authenticated,
    uid,
    connection,
    isConnectionCurrent,
  ]);
  const enabled = Boolean(location && authenticated && connected);
  const read = useSubscriptionRead({
    scope: readScope,
    path: `perimeter/${location}/brightnessStatus`,
    area: "stöðu bjartleika",
    initial: null,
    parse: parsePerimeterBrightnessStatus,
    isCurrent,
    enabled,
    clearOnError: true,
  });
  const { value: report, status, retry } = read;
  const value = useMemo<TelemetryValue>(
    () => ({
      brightnessStatus: enabled ? report : null,
      status:
        authenticated && location && !connected
          ? readFailure("stöðu bjartleika")
          : status,
      retry,
    }),
    [enabled, report, status, retry, authenticated, location, connected],
  );
  return (
    <TelemetryContext.Provider value={value}>
      {children}
    </TelemetryContext.Provider>
  );
}

export function usePerimeterTelemetry() {
  const value = useContext(TelemetryContext);
  if (!value)
    throw new Error("usePerimeterTelemetry requires FirebaseStateProvider");
  return value;
}
