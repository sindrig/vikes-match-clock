// Emulator-only entrypoint; excluded from the production build.
import { deleteApp } from "firebase/app";
import { signInWithEmailAndPassword } from "firebase/auth";
import {
  goOffline,
  onValue,
  ref,
  runTransaction,
  set,
} from "firebase/database";
import { useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

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
import { app, auth, database } from "../../src/firebase";
import { firebaseDatabase } from "../../src/firebaseDatabase";
import type { TimedAssetCompletionObservation } from "../../src/lib/conditionalTransitions";
import type { ControllerState } from "../../src/types";
import { beforeDeadline, PlaybackProducers } from "./fixture-sdk-producers";
import {
  assertPlaybackFixtureTarget,
  parsePlaybackFixtureInput,
  type PlaybackFixtureInput,
} from "./playback-fixture-input";

type Api = ReturnType<typeof useFirebaseState>;
type ServerCallback = (status: string, data?: unknown) => void;
type ServerMethod = (
  path: string,
  data: unknown,
  callback?: ServerCallback,
  hash?: string,
) => void;

// Loading the page exposes only read-only provenance. No ref, patch, provider,
// prefix assignment or login happens until initialize validates both inputs.
const input = parsePlaybackFixtureInput(new URL(window.location.href));
const target = Object.freeze({
  compiledEmulator: import.meta.env.VITE_USE_EMULATOR === "true",
  projectId: app.options.projectId,
  databaseURL: app.options.databaseURL,
  storageBucket: app.options.storageBucket,
  auth: auth.emulatorConfig,
});
const producers = new PlaybackProducers();
const held: (() => void)[] = [];
const hashes: string[] = [];
const statuses: string[] = [];
const subscriptions: (() => void)[] = [];
const objectUrls = new Set<string>();
let api: Api | undefined;
let root: Root | undefined;
let initialized = false;
let retiring = false;
let disposed = false;
let connected = false;
let rawController: unknown = null;
let rawAudit: unknown = null;
let controllerDeliveries = 0;
let auditDeliveries = 0;
let hold: "transaction" | "audit" | undefined;
let restore: () => void = () => undefined;
let disposePromise: Promise<void> | undefined;

function requireActive() {
  if (!initialized || retiring)
    throw new Error("Playback fixture is not active.");
}
function commands() {
  requireActive();
  if (input.role === "observer" || !api)
    throw new Error("No writable playback provider.");
  return api;
}

function readFailed() {
  producers.failures.push("Playback subscription cancelled.");
  producers.changed();
}

function interceptSdk() {
  ref(database); // Initialize the actual lazy SDK repository after admission.
  const server = (
    database as unknown as {
      _repoInternal: { server_: { put: ServerMethod; merge: ServerMethod } };
    }
  )._repoInternal.server_;
  if (typeof server.put !== "function" || typeof server.merge !== "function")
    throw new Error("Unsupported playback SDK transport.");
  const originalPut = server.put;
  const originalMerge = server.merge;
  for (const method of ["put", "merge"] as const) {
    const original = server[method];
    server[method] = (path, data, callback, hash) => {
      if (typeof callback !== "function") {
        producers.failures.push("Unobservable SDK submission.");
        throw new Error("Playback SDK callback is required.");
      }
      const send = producers.send(method, path);
      const conditional = method === "put" && typeof hash === "string";
      if (conditional) hashes.push(hash);
      const wrapped: ServerCallback = function (
        this: unknown,
        status,
        response,
      ) {
        if (conditional) statuses.push(status);
        if (
          status !== "ok" &&
          status !== "datastale" &&
          !(
            status === "permission_denied" &&
            path === `states/${input.deniedVenue}/controller/playing`
          ) &&
          !(
            status === "permission_denied" &&
            path === `/states/${input.deniedVenue}/controller/playing`
          )
        )
          producers.failures.push("Unexpected SDK acknowledgement.");
        producers.acknowledge(send, status, () =>
          Reflect.apply(callback, this, [status, response]),
        );
      };
      const submit = () =>
        Reflect.apply(original, server, [path, data, wrapped, hash]);
      const audit =
        method === "merge" &&
        path === "/" &&
        data !== null &&
        typeof data === "object" &&
        Object.keys(data).some((key) =>
          key.startsWith(`audit/${input.venue}/`),
        );
      if (
        (hold === "transaction" && conditional) ||
        (hold === "audit" && audit)
      ) {
        held.push(submit);
        return;
      }
      return submit();
    };
  }
  const originalAudited = firebaseDatabase.writeAudited;
  const originalAuditOnly = firebaseDatabase.writeAuditOnly;
  firebaseDatabase.writeAudited = (...args) =>
    producers.track(() =>
      Reflect.apply(originalAudited, firebaseDatabase, args),
    );
  firebaseDatabase.writeAuditOnly = (...args) =>
    producers.track(
      () => Reflect.apply(originalAuditOnly, firebaseDatabase, args),
      true,
    );
  const originalObjectUrl = URL.createObjectURL.bind(URL);
  const objectUrlDescriptor = Object.getOwnPropertyDescriptor(
    URL,
    "createObjectURL",
  );
  if (!objectUrlDescriptor) throw new Error("Unsupported object URL API.");
  if (input.role === "display") {
    URL.createObjectURL = (object) => {
      const url = Reflect.apply(originalObjectUrl, URL, [object]);
      objectUrls.add(url);
      return url;
    };
  }
  restore = () => {
    server.put = originalPut;
    server.merge = originalMerge;
    firebaseDatabase.writeAudited = originalAudited;
    firebaseDatabase.writeAuditOnly = originalAuditOnly;
    Object.defineProperty(URL, "createObjectURL", objectUrlDescriptor);
  };
}

function trackCommands(value: Api): Api {
  // Each wrapper retains this render's actual function. Never forward an old
  // intention to a mutable ref holding a newer command origin.
  return {
    ...value,
    addItemsToQueue: (...args) =>
      producers.track(() => value.addItemsToQueue(...args)),
    completeAssetIfCurrent: (...args) =>
      producers.track(() => value.completeAssetIfCurrent(...args)),
    renderAsset: (...args) => producers.track(() => value.renderAsset(...args)),
    showNextAsset: (...args) =>
      producers.invoke(() => value.showNextAsset(...args)),
    updateQueueSettings: (...args) =>
      producers.invoke(() => value.updateQueueSettings(...args)),
  };
}

function release() {
  hold = undefined;
  held.splice(0).forEach((send) => send());
}

const harness = {
  input,
  target,
  initialize(expected: PlaybackFixtureInput) {
    assertPlaybackFixtureTarget(target);
    const parsed = parsePlaybackFixtureInput(new URL(window.location.href));
    if (
      initialized ||
      retiring ||
      Object.keys(expected).length !== 4 ||
      expected.fixtureId !== input.fixtureId ||
      expected.venue !== input.venue ||
      expected.deniedVenue !== input.deniedVenue ||
      expected.role !== input.role ||
      parsed.fixtureId !== input.fixtureId ||
      parsed.venue !== input.venue ||
      parsed.deniedVenue !== input.deniedVenue ||
      parsed.role !== input.role
    )
      throw new Error("Playback fixture initialization mismatch.");
    localStorage.setItem("clock_listenPrefix", input.venue);
    initialized = true;
    if (input.role !== "observer") interceptSdk();
    subscriptions.push(
      onValue(
        ref(database, ".info/connected"),
        (snapshot) => {
          connected = snapshot.val() === true;
        },
        readFailed,
      ),
    );
    if (input.role === "observer") {
      subscriptions.push(
        onValue(
          ref(database, `states/${input.venue}/controller`),
          (snapshot) => {
            rawController = snapshot.val() as unknown;
            controllerDeliveries++;
          },
          readFailed,
        ),
      );
    } else {
      const element = document.getElementById("root");
      if (!element) throw new Error("Missing playback fixture root.");
      root = createRoot(element);
      root.render(
        <LocalStateProvider>
          <Bridge />
        </LocalStateProvider>,
      );
    }
  },
  get commands() {
    return commands();
  },
  snapshot: () => ({
    controller: api?.controller ?? null,
    eligible: api?.writeEligible ?? false,
    uid: auth.currentUser?.uid ?? null,
    connected,
    rawController,
    rawAudit,
    controllerDeliveries,
    auditDeliveries,
  }),
  lifecycle: () => ({ ...producers.snapshot(), held: held.length, disposed }),
  login(email: string, password: string, uid: string) {
    requireActive();
    if (email !== `e2e-playback-${input.fixtureId}@example.test`)
      throw new Error("Playback account does not belong to this fixture.");
    return producers.track(async () => {
      const result = await signInWithEmailAndPassword(auth, email, password);
      if (result.user.uid !== uid || auth.currentUser?.uid !== uid)
        throw new Error("Playback Auth identity mismatch.");
      if (input.role === "observer")
        subscriptions.push(
          onValue(
            ref(database, `audit/${input.venue}`),
            (snapshot) => {
              rawAudit = snapshot.val() as unknown;
              auditDeliveries++;
            },
            readFailed,
          ),
        );
    });
  },
  observe: (): TimedAssetCompletionObservation => {
    const { currentAsset, activeQueueId, playing } = commands().controller;
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
  arm: (kind: "transaction" | "audit" = "transaction") => {
    commands();
    hold = kind;
    hashes.length = 0;
    statuses.length = 0;
  },
  release,
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
    void commands()
      .completeAssetIfCurrent(observation)
      .then(
        (result) => {
          harness.result = result;
        },
        () => {
          // The tracked original rejection makes retirement fail as well.
        },
      );
  },
  deny: () => {
    commands();
    const first = producers.sends.length;
    return producers.track(
      () =>
        set(
          ref(database, `states/${input.deniedVenue}/controller/playing`),
          true,
        ),
      false,
      (error) =>
        error instanceof Error &&
        /permission_denied/i.test(error.message) &&
        producers.sends
          .slice(first)
          .some(
            (send) =>
              send.delivered &&
              send.status === "permission_denied" &&
              send.path.replace(/^\//, "") ===
                `states/${input.deniedVenue}/controller/playing`,
          ),
    );
  },
  // Original tuple-only/non-autoplay old binary, with only its root migrated.
  oldComplete: (observed: TimedAssetCompletionObservation) => {
    commands();
    return producers.track(() =>
      runTransaction(
        ref(database, `states/${input.venue}/controller`),
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
    );
  },
  dispose(timeoutMs: number) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 20000)
      return Promise.reject(new Error("Invalid playback disposal bound."));
    if (disposePromise) return disposePromise;
    retiring = true;
    const deadline = Date.now() + timeoutMs;
    disposePromise = (async () => {
      try {
        root?.unmount();
      } catch {
        producers.failures.push("Playback provider unmount failed.");
      } finally {
        root = undefined;
        // Retiring the provider cannot revoke an already submitted SDK send.
        release();
      }
      await producers.drain(deadline);
      subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
      for (const key of ["oldVideo", "oldEnd", "oldGif", "youtubePlayers"])
        Reflect.deleteProperty(window, key);
      restore();
      for (const url of objectUrls) URL.revokeObjectURL(url);
      objectUrls.clear();
      goOffline(database);
      await beforeDeadline(deleteApp(app), deadline);
      disposed = true;
    })();
    return disposePromise;
  },
};
declare global {
  interface Window {
    playbackHarness: typeof harness;
  }
}
window.playbackHarness = harness;
function Display() {
  const value = useFirebaseState();
  const rendered = useDeferredAsset(value.controller.currentAsset);
  return <>{rendered && <PlaybackAsset current={rendered} />}</>;
}
function Screen() {
  const value = useFirebaseState();
  useLayoutEffect(() => {
    api = trackCommands(value);
  }, [value]);
  return input.role === "display" ? <Display /> : null;
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
