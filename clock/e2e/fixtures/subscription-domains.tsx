// Explicit emulator-only entry. The production entrypoint imports none of it.
import { signInWithEmailAndPassword } from "firebase/auth";
import { get, goOffline, goOnline, onValue, ref, set } from "firebase/database";
import { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "../../src/App";
import {
  FirebaseStateProvider,
  useFirebaseReadStatus,
  useFirebaseState,
} from "../../src/contexts/FirebaseStateContext";
import {
  LocalStateProvider,
  useLocalState,
} from "../../src/contexts/LocalStateContext";
import type { TimedAssetCompletionObservation } from "../../src/lib/conditionalTransitions";
import { app, auth, database } from "../../src/firebase";
import { firebaseDatabase } from "../../src/firebaseDatabase";
import "../../src/index.css";

if (app.options.projectId !== "vikes-match-clock-test")
  throw new Error("Emulators required");
if (new URLSearchParams(location.search).has("offline")) goOffline(database);
let api: ReturnType<typeof useFirebaseState>;
let local: ReturnType<typeof useLocalState>;
let reads: ReturnType<typeof useFirebaseReadStatus>;
let retained: ReturnType<typeof useFirebaseState>;
const history: {
  location: string;
  ready: boolean;
  brightness: number | null;
  applied: number | null;
  asset: unknown;
}[] = [];
const counts = { ordinary: 0, audit: 0, sdk: [] as string[] };
const submitted: Promise<void>[] = [];
const write = firebaseDatabase.writeAudited;
firebaseDatabase.writeAudited = (...args) => {
  counts.ordinary++;
  const promise = write(...args);
  submitted.push(promise);
  return promise;
};
const audit = firebaseDatabase.writeAuditOnly;
firebaseDatabase.writeAuditOnly = (...args) => {
  counts.audit++;
  return audit(...args);
};
type ServerMethod = (...args: unknown[]) => unknown;
ref(database);
const server = (
  database as unknown as {
    _repoInternal: { server_: { put: ServerMethod; merge: ServerMethod } };
  }
)._repoInternal.server_;
const acknowledgements: { received: boolean; release?: () => void }[] = [];
let hold = false;
for (const name of ["put", "merge"] as const) {
  const original = server[name].bind(server);
  server[name] = (...args) => {
    const path = String(args[0]);
    // Presence is independently permitted public I/O, not a match command.
    if (!path.startsWith("/presence/")) counts.sdk.push(`${name}:${path}`);
    const callback = args[2];
    if (hold && name === "merge" && typeof callback === "function") {
      const entry: (typeof acknowledgements)[number] = { received: false };
      acknowledgements.push(entry);
      args[2] = (...result: unknown[]) => {
        entry.received = true;
        entry.release = () => callback(...result);
      };
    }
    return original(...args);
  };
}
const result = (promise: Promise<unknown>) =>
  promise.then(
    () => "accepted",
    () => "denied",
  );
export const harness = {
  snapshot: () => ({
    location: local.listenPrefix,
    uid: auth.currentUser?.uid,
    ready: api.ready,
    eligible: api.writeEligible,
    freshness: api.writeFreshness,
    read: reads.status,
    brightness: api.perimeterBrightness,
    telemetry: api.perimeterBrightnessStatus,
    match: api.match,
    controller: api.controller,
    now: api.getServerTime(),
  }),
  history,
  counts,
  reset: () => {
    counts.ordinary = 0;
    counts.audit = 0;
    counts.sdk.length = 0;
    submitted.length = 0;
    history.length = 0;
    retained = api;
  },
  retain: () => {
    retained = api;
  },
  retry: () => reads.retry(),
  choose: (venue: string) => local.setListenPrefix(venue),
  perimeterMode: () => local.setDisplayTarget({ kind: "perimeter" }),
  complete: (observation: TimedAssetCompletionObservation) =>
    api.completeAssetIfCurrent(observation),
  login: (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password),
  logout: () => local.logout(),
  offline: () => goOffline(database),
  online: () => goOnline(database),
  staleWrite: () => result(retained.setPerimeterBrightness(59)),
  brightness: (percent: number) => api.setPerimeterBrightness(percent),
  rapidGoals: () => {
    const command = api.addGoal;
    command("home");
    command("home");
  },
  settle: () => Promise.all(submitted),
  rawRead: (path: string) => result(get(ref(database, path))),
  rawWrite: (path: string) => result(set(ref(database, path), 99)),
  holdAcknowledgements: () => {
    hold = true;
  },
  acknowledgements: () => acknowledgements.map((entry) => entry.received),
  releaseAcknowledgements: () => {
    hold = false;
    acknowledgements.forEach((entry) => entry.release?.());
  },
  createAndAppend: () => {
    const command = api;
    const creation = command.createQueue("SDK echo", [
      { type: "IMAGE", key: "one" },
    ]);
    const id = Object.values(valuesForQueue()).find(
      (queue) => queue.name === "SDK echo",
    )?.id;
    if (!id) throw new Error("No synchronous SDK queue echo");
    return {
      creation: result(creation),
      append: result(
        command.addItemsToQueue(id, [{ type: "IMAGE", key: "two" }]),
      ),
    };
  },
};
// Calculation refs are checked inside commands. This observer records the SDK
// echo before React commit, without replacing the writer's subscribed refs.
let queues: ReturnType<typeof useFirebaseState>["controller"]["queues"] = {};
function valuesForQueue() {
  return queues;
}
export type SubscriptionDomainsHarness = typeof harness;
declare global {
  interface Window {
    subscriptionDomains: SubscriptionDomainsHarness;
  }
}
window.subscriptionDomains = harness;
function Capture() {
  const value = useFirebaseState();
  const localValue = useLocalState();
  const read = useFirebaseReadStatus();
  useLayoutEffect(() => {
    api = value;
    local = localValue;
    reads = read;
    history.push({
      location: local.listenPrefix,
      ready: api.ready,
      brightness: api.perimeterBrightness,
      applied: api.perimeterBrightnessStatus?.appliedPercent ?? null,
      asset: api.controller.currentAsset,
    });
  });
  return null;
}
function Bridge() {
  const state = useLocalState();
  useLayoutEffect(() => {
    if (!state.listenPrefix) return;
    return onValue(
      ref(database, `states/${state.listenPrefix}/controller/queues`),
      (snapshot) => {
        queues = (snapshot.val() as typeof queues) ?? {};
      },
    );
  }, [state.listenPrefix]);
  return (
    <FirebaseStateProvider
      listenPrefix={state.listenPrefix}
      isAuthenticated={state.auth.isLoaded && !state.auth.isEmpty}
      uid={state.auth.uid}
      screenKey={state.screenKey}
      mutationSession={state.mutationSession}
    >
      <Capture />
      <App />
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
