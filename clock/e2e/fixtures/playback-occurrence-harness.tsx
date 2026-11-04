// Emulator-only entrypoint; excluded from the production build.
import { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { signInWithEmailAndPassword } from "firebase/auth";
import { ref, runTransaction, set } from "firebase/database";
import { app, auth, database } from "../../src/firebase";
import {
  FirebaseStateProvider,
  useFirebaseState,
} from "../../src/contexts/FirebaseStateContext";
import {
  LocalStateProvider,
  useLocalState,
} from "../../src/contexts/LocalStateContext";
import {
  PlaybackAsset,
  useDeferredAsset,
} from "../../src/controller/asset/Asset";
import type { TimedAssetCompletionObservation } from "../../src/lib/conditionalTransitions";
import type { ControllerState } from "../../src/types";

if (app.options.projectId !== "vikes-match-clock-test")
  throw new Error("Local emulators required");
type Api = ReturnType<typeof useFirebaseState>;
let api: Api;
const location = "audit244";
let hold = false;
const held: (() => void)[] = [];
const hashes: string[] = [];
const statuses: string[] = [];
ref(database);
type ServerMethod = (...args: unknown[]) => unknown;
const server = (
  database as unknown as { _repoInternal: { server_: { put: ServerMethod } } }
)._repoInternal.server_;
const put = server.put.bind(server);
server.put = (...args) => {
  // Gate actual SDK transaction sends, preserving the SDK's hash, retries and
  // emulator decision. No mocked transaction or REST CAS substitutes.
  if (typeof args[3] === "string") {
    hashes.push(args[3]);
    const callback = args[2] as (...result: unknown[]) => void;
    args[2] = (...result: unknown[]) => {
      statuses.push(String(result[0]));
      callback(...result);
    };
    if (hold) {
      held.push(() => {
        put(...args);
      });
      return;
    }
  }
  return put(...args);
};
const harness = {
  get commands() {
    return api;
  },
  snapshot: () => ({ controller: api.controller, eligible: api.writeEligible }),
  login: (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password).then(() => undefined),
  observe: (): TimedAssetCompletionObservation => {
    const { currentAsset, activeQueueId, playing } = api.controller;
    if (!currentAsset) throw new Error("No current playback");
    return {
      occurrenceId:
        currentAsset.occurrenceId === undefined
          ? null
          : currentAsset.occurrenceId,
      assetKey: currentAsset.asset.key,
      time: currentAsset.time,
      activeQueueId,
      playing,
    };
  },
  arm: () => {
    hold = true;
    hashes.length = 0;
    statuses.length = 0;
  },
  release: () => {
    hold = false;
    held.splice(0).forEach((send) => send());
  },
  get held() {
    return held.length;
  },
  get hashes() {
    return [...hashes];
  },
  get statuses() {
    return [...statuses];
  },
  result: undefined as boolean | undefined,
  compete: (observation: TimedAssetCompletionObservation) => {
    harness.result = undefined;
    void api.completeAssetIfCurrent(observation).then((result) => {
      harness.result = result;
    });
  },
  deny: () =>
    set(ref(database, "states/audit244-denied/controller/playing"), true),
  // Reviewed-base tuple check and non-autoplay completion branch, using the
  // real SDK/rules. The test disables autoplay after selecting timed media,
  // so it does not depend on null-duration normalization absent in old code.
  oldComplete: (observed: TimedAssetCompletionObservation) =>
    runTransaction(
      ref(database, `states/${location}/controller`),
      (raw: ControllerState | null) => {
        if (
          !raw?.currentAsset ||
          raw.currentAsset.asset.key !== observed.assetKey ||
          raw.currentAsset.time !== observed.time ||
          raw.activeQueueId !== observed.activeQueueId ||
          raw.playing !== observed.playing
        )
          return;
        if (raw.activeQueueId && raw.queues[raw.activeQueueId]?.autoPlay)
          return;
        return { ...raw, currentAsset: null };
      },
    ).then((result) => result.committed),
};
declare global {
  interface Window {
    playbackHarness: typeof harness;
  }
}
window.playbackHarness = harness;
function Screen() {
  const value = useFirebaseState();
  useLayoutEffect(() => {
    api = value;
  }, [value]);
  const rendered = useDeferredAsset(value.controller.currentAsset);
  return <>{rendered && <PlaybackAsset current={rendered} />}</>;
}
function Bridge() {
  const local = useLocalState();
  return (
    <FirebaseStateProvider
      listenPrefix={local.listenPrefix}
      isAuthenticated={local.auth.isLoaded && !local.auth.isEmpty}
      uid={local.auth.uid}
      mutationSession={local.mutationSession}
      screenKey={null}
    >
      <Screen />
    </FirebaseStateProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <LocalStateProvider>
    <Bridge />
  </LocalStateProvider>,
);
