// Emulator-only entrypoint. The production app, providers, lifecycle and SDK
// run unchanged; this observer and its wire/timer counters are test-only.
import { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { goOffline, goOnline, onValue, ref, set } from "firebase/database";
import { app, database } from "../../src/firebase";
import App from "../../src/App";
import {
  FirebaseStateProvider,
  useFirebaseState,
} from "../../src/contexts/FirebaseStateContext";
import {
  LocalStateProvider,
  useLocalState,
} from "../../src/contexts/LocalStateContext";
import type {
  CountdownCompletionObservation,
  TimedAssetCompletionObservation,
} from "../../src/lib/conditionalTransitions";
import "../../src/assets/fonts/gt-america.css";
import "../../src/index.css";

if (app.options.projectId !== "vikes-match-clock-test") {
  throw new Error("Stale session fixture requires local emulators.");
}

type Api = ReturnType<typeof useFirebaseState>;
let api: Api;
let retained: Api;
let countdown: CountdownCompletionObservation;
let asset: TimedAssetCompletionObservation;
let connected = false;
const deliveries: unknown[] = [];
const writes: { path: string; status: string | null }[] = [];

onValue(ref(database, ".info/connected"), (snapshot) => {
  connected = snapshot.val() === true;
});

// Observe actual SDK sends and acknowledgements, including any writes queued
// while offline. Forward the original arguments, hashes and callbacks intact.
type ServerMethod = (...args: unknown[]) => unknown;
const server = (
  database as unknown as {
    _repoInternal: { server_: { put: ServerMethod; merge: ServerMethod } };
  }
)._repoInternal.server_;
for (const method of ["put", "merge"] as const) {
  const original = server[method].bind(server);
  server[method] = (...args) => {
    const write = { path: String(args[0]), status: null as string | null };
    writes.push(write);
    const callback = args[2] as (...result: unknown[]) => void;
    args[2] = (...result: unknown[]) => {
      write.status = String(result[0]);
      callback(...result);
    };
    return original(...args);
  };
}

// Both ClockBase and MatchLifecycle use 100 ms intervals. Recording every
// registered callback lets tests prove they actually ran past the deadline;
// moving Date alone does not establish that overdue work was processed.
const intervals: { ticks: number }[] = [];
const originalInterval = window.setInterval.bind(window);
const observedInterval = (
  handler: TimerHandler,
  timeout?: number,
  ...args: unknown[]
) => {
  if (timeout !== 100 || typeof handler !== "function") {
    return originalInterval(handler, timeout, ...args);
  }
  const interval = { ticks: 0 };
  intervals.push(interval);
  const callback = handler as (...values: unknown[]) => void;
  return originalInterval(() => {
    callback(...args);
    interval.ticks++;
  }, timeout);
};
Object.defineProperty(window, "setInterval", { value: observedInterval });

const harness = {
  snapshot: () => ({
    connected,
    eligible: api.writeEligible,
    freshness: api.writeFreshness,
    match: api.match,
    controller: api.controller,
    serverTime: api.getServerTime(),
    ticks: intervals.map((interval) => interval.ticks),
    writes,
  }),
  get deliveries() {
    return deliveries;
  },
  capture: () => {
    retained = api;
    countdown = {
      started: api.match.started,
      countdown: api.match.countdown,
      halftimeCountdown: api.match.halftimeCountdown,
    };
    const { currentAsset, activeQueueId, playing } = api.controller;
    if (currentAsset) {
      asset = {
        occurrenceId: currentAsset.occurrenceId ?? null,
        assetKey: currentAsset.asset.key,
        time: currentAsset.time,
        activeQueueId,
        playing,
      };
    }
    writes.length = 0;
    return { countdown, asset };
  },
  complete: (kind: "countdown" | "asset", origin: "retained" | "current") => {
    const commands = origin === "retained" ? retained : api;
    return kind === "countdown"
      ? commands.completeCountdownIfCurrent(countdown)
      : commands.completeAssetIfCurrent(asset);
  },
  disconnect: () => goOffline(database),
  reconnect: () => goOnline(database),
  deny: () =>
    set(ref(database, "states/stale-session-denied/match/homeScore"), 1),
  // A fresh audited SDK write is an acknowledged positive barrier, after the
  // awaited stale completions and the post-resync timer pass. A REST read of
  // unchanged B alone could succeed before a delayed stale write arrives.
  checkpoint: () => api.updateMatch({ injuryTime: api.match.injuryTime + 1 }),
};
export type StaleSessionHarness = typeof harness;
declare global {
  interface Window {
    staleSessionHarness: StaleSessionHarness;
  }
}
window.staleSessionHarness = harness;

function Observer() {
  const value = useFirebaseState();
  useLayoutEffect(() => {
    api = value;
    deliveries.push({
      freshness: value.writeFreshness,
      eligible: value.writeEligible,
      started: value.match.started,
      countdown: value.match.countdown,
      asset: value.controller.currentAsset,
    });
  }, [value]);
  return null;
}
function Bridge() {
  const { listenPrefix, auth, screenKey, mutationSession } = useLocalState();
  return (
    <FirebaseStateProvider
      listenPrefix={listenPrefix}
      isAuthenticated={auth.isLoaded && !auth.isEmpty}
      screenKey={screenKey}
      uid={auth.uid}
      mutationSession={mutationSession}
    >
      <App />
      <Observer />
    </FirebaseStateProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <LocalStateProvider>
      <Bridge />
    </LocalStateProvider>
  </BrowserRouter>,
);
