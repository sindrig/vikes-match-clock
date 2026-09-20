import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import useScreenPresence, {
  ScreenPresenceDiagnostics,
} from "../hooks/useScreenPresence";
import {
  getOrCreateDisplayLabel,
  getDisplayResolution,
} from "../lib/displayIdentity";

/**
 * Report channel for display-side renderer problems. The perimeter display
 * reports every renderer error (and recovery) so the controller's
 * Skjáarvillur panel can show per-screen faults without anyone standing at
 * the venue screen. Reports flow into the screen's presence record via
 * `useScreenPresence` — the only writable path for unauthenticated displays.
 */
interface DisplayDiagnosticsValue {
  reportError: (message: string | null) => void;
}

const DisplayDiagnosticsContext = createContext<DisplayDiagnosticsValue>({
  reportError: () => undefined,
});

interface DisplayDiagnosticsProviderProps {
  listenPrefix: string;
  displayKind: "scoreboard" | "perimeter";
  children: ReactNode;
}

export function DisplayDiagnosticsProvider({
  listenPrefix,
  displayKind,
  children,
}: DisplayDiagnosticsProviderProps) {
  const [error, setError] = useState<string | null>(null);

  const reportError = useCallback((message: string | null) => {
    setError((previous) => (previous === message ? previous : message));
  }, []);

  const label = useMemo(() => getOrCreateDisplayLabel(), []);
  const resolution = useMemo(() => getDisplayResolution(), []);

  const diagnostics: ScreenPresenceDiagnostics = useMemo(
    () => ({ error, label, resolution }),
    [error, label, resolution],
  );

  useScreenPresence(listenPrefix, displayKind, diagnostics);

  const value = useMemo(() => ({ reportError }), [reportError]);

  return (
    <DisplayDiagnosticsContext.Provider value={value}>
      {children}
    </DisplayDiagnosticsContext.Provider>
  );
}

export function useDisplayDiagnostics(): DisplayDiagnosticsValue {
  return useContext(DisplayDiagnosticsContext);
}
