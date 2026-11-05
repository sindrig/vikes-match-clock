// Local emulator-only entrypoint. No fixture is included in the live bundle.
import { deleteApp } from "firebase/app";
import { signInWithEmailAndPassword } from "firebase/auth";
import { goOffline, onValue, ref, set } from "firebase/database";
import {
  getBytes,
  listAll,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
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
import Asset, {
  PlaybackAsset,
  useDeferredAsset,
} from "../../src/controller/asset/Asset";
import SubstitutionInfo from "../../src/controller/asset/queue/SubstitutionInfo";
import Team from "../../src/controller/asset/team/Team";
import {
  app,
  auth,
  database,
  storage,
  storageHelpers,
} from "../../src/firebase";
import { firebaseDatabase } from "../../src/firebaseDatabase";
import MatchLifecycle from "../../src/match/MatchLifecycle";
import {
  backfillOverlayGenerations,
  backfillStorageGenerations,
} from "../../src/perimeter/media";
import { beforeDeadline, PlaybackProducers } from "./fixture-sdk-producers";
import {
  assertNestedFixtureTarget,
  nestedMediaPaths,
  parseNestedFixtureInput,
  type NestedFixtureInput,
} from "./nested-fixture-input";

type Api = ReturnType<typeof useFirebaseState>;
type ServerCallback = (status: string, data?: unknown) => void;
type ServerMethod = (
  path: string,
  data: unknown,
  callback?: ServerCallback,
  hash?: string,
) => void;

// Import exposes only provenance. Admission precedes ref/patch/prefix/mount/login.
const input = parseNestedFixtureInput(new URL(window.location.href));
const target = Object.freeze({
  compiledEmulator: import.meta.env.VITE_USE_EMULATOR === "true",
  projectId: app.options.projectId,
  databaseURL: app.options.databaseURL,
  storageBucket: app.options.storageBucket,
  auth: auth.emulatorConfig,
});
const producers = new PlaybackProducers();
const transport: Array<{
  method: "put" | "merge";
  path: string;
  data: unknown;
}> = [];
const subscriptions: (() => void)[] = [];
let api: Api | undefined;
let root: Root | undefined;
let initialized = false;
let retiring = false;
let disposed = false;
let attempts = 0;
let connected = false;
let rawState: unknown = null;
let rawAudit: unknown = null;
let stateDeliveries = 0;
let auditDeliveries = 0;
let restore: () => void = () => undefined;
let disposePromise: Promise<void> | undefined;

function requireActive() {
  if (!initialized || retiring)
    throw new Error("Nested fixture is not active.");
}
function commands() {
  requireActive();
  if (input.role !== "controller" || !api)
    throw new Error("No writable nested provider.");
  return api;
}
function readFailed() {
  producers.failures.push("Nested subscription cancelled.");
  producers.changed();
}
function interceptSdk() {
  ref(database);
  const server = (
    database as unknown as {
      _repoInternal: { server_: { put: ServerMethod; merge: ServerMethod } };
    }
  )._repoInternal.server_;
  if (typeof server.put !== "function" || typeof server.merge !== "function")
    throw new Error("Unsupported nested SDK transport.");
  const originalPut = server.put;
  const originalMerge = server.merge;
  for (const method of ["put", "merge"] as const) {
    const original = server[method];
    server[method] = (path, data, callback, hash) => {
      if (typeof callback !== "function") {
        producers.failures.push("Unobservable SDK submission.");
        throw new Error("Nested SDK callback is required.");
      }
      attempts++;
      transport.push({ method, path, data: structuredClone(data) });
      const send = producers.send(method, path);
      const wrapped: ServerCallback = function (
        this: unknown,
        status,
        response,
      ) {
        if (
          status !== "ok" &&
          status !== "datastale" &&
          !(
            status === "permission_denied" &&
            path.replace(/^\//, "") ===
              `states/${input.deniedVenue}/controller/playing`
          )
        )
          producers.failures.push("Unexpected SDK acknowledgement.");
        producers.acknowledge(send, status, () =>
          Reflect.apply(callback, this, [status, response]),
        );
      };
      return Reflect.apply(original, server, [path, data, wrapped, hash]);
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
  restore = () => {
    server.put = originalPut;
    server.merge = originalMerge;
    firebaseDatabase.writeAudited = originalAudited;
    firebaseDatabase.writeAuditOnly = originalAuditOnly;
  };
}
function trackCommands(value: Api): Api {
  // Keep this render's functions: a retained intention never borrows a new origin.
  return {
    ...value,
    editPlayer: (...args) => producers.invoke(() => value.editPlayer(...args)),
    deletePlayer: (...args) =>
      producers.invoke(() => value.deletePlayer(...args)),
    addPlayer: (...args) => producers.invoke(() => value.addPlayer(...args)),
    setRoster: (...args) => producers.invoke(() => value.setRoster(...args)),
    clearRoster: (...args) =>
      producers.invoke(() => value.clearRoster(...args)),
    appendSubstitutionAndActivate: (...args) =>
      producers.track(() => value.appendSubstitutionAndActivate(...args)),
    updateQueueSettings: (...args) =>
      producers.invoke(() => value.updateQueueSettings(...args)),
    playQueue: (...args) => producers.invoke(() => value.playQueue(...args)),
    completeAssetIfCurrent: (...args) =>
      producers.track(() => value.completeAssetIfCurrent(...args)),
    setPerimeterOverlay: (...args) =>
      producers.track(() => value.setPerimeterOverlay(...args)),
  };
}
function unauthorized(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "storage/unauthorized"
  );
}
function requireStorageRole(role: "controller" | "anonymous") {
  requireActive();
  if (
    input.role !== role ||
    (role === "anonymous" && auth.currentUser !== null)
  )
    throw new Error("Invalid nested Storage role.");
}

const harness = {
  input,
  target,
  initialize(expected: NestedFixtureInput) {
    assertNestedFixtureTarget(target);
    const parsed = parseNestedFixtureInput(new URL(window.location.href));
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
      throw new Error("Nested fixture initialization mismatch.");
    localStorage.setItem("clock_listenPrefix", input.venue);
    initialized = true;
    if (input.role === "controller") interceptSdk();
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
          ref(database, `states/${input.venue}`),
          (snapshot) => {
            rawState = snapshot.val() as unknown;
            stateDeliveries++;
          },
          readFailed,
        ),
      );
    } else if (input.role === "controller") {
      const element = document.getElementById("root");
      if (!element) throw new Error("Missing nested fixture root.");
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
  status: () => ({
    eligible: api?.writeEligible ?? false,
    uid: auth.currentUser?.uid ?? null,
    connected,
    rawState,
    rawAudit,
    stateDeliveries,
    auditDeliveries,
    attempts,
    transport,
  }),
  snapshot() {
    const value = commands();
    return {
      controller: value.controller,
      match: value.match,
      view: value.view,
      perimeterOverlay: value.perimeterOverlay,
      perimeterAdLayout: value.perimeterAdLayout,
      mediaPairs: value.mediaPairs,
      eligible: value.writeEligible,
      attempts,
      transport,
    };
  },
  lifecycle: () => ({ ...producers.snapshot(), disposed }),
  resetAttempts() {
    requireActive();
    const pending = producers.snapshot();
    if (pending.pendingCommands || pending.pendingAudits || pending.pendingSdk)
      throw new Error("Nested diagnostics still have submitted producers.");
    attempts = 0;
    transport.length = 0;
  },
  login(email: string, password: string, uid: string) {
    requireActive();
    if (
      input.role === "anonymous" ||
      email !== `e2e-nested-${input.fixtureId}@example.test`
    )
      throw new Error("Nested account does not belong to this fixture.");
    return producers.track(async () => {
      const result = await signInWithEmailAndPassword(auth, email, password);
      if (result.user.uid !== uid || auth.currentUser?.uid !== uid)
        throw new Error("Nested Auth identity mismatch.");
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
  denied() {
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
  seedCurrent(current: unknown) {
    commands();
    return producers.track(() =>
      set(
        ref(database, `states/${input.venue}/controller/currentAsset`),
        current,
      ),
    );
  },
  mediaUrl() {
    requireStorageRole("controller");
    return producers.track(() =>
      storageHelpers.getDownloadURL(nestedMediaPaths(input)[0]),
    );
  },
  qualifyMedia() {
    const value = commands();
    return producers.track(async () => {
      if (!value.perimeterOverlay || !value.perimeterAdLayout)
        throw new Error("Expected saved media");
      const reads: string[] = [];
      const generation = async (source: string) => {
        reads.push(source);
        return (await storageHelpers.getMetadata(source)).generation;
      };
      return {
        overlay: await backfillOverlayGenerations(
          value.perimeterOverlay,
          generation,
        ),
        layout: await backfillStorageGenerations(
          value.perimeterAdLayout,
          generation,
        ),
        reads,
      };
    });
  },
  authorizedStorage() {
    requireStorageRole("controller");
    return producers.track(async () => {
      const reference = storageRef(
        storage,
        `${input.venue}/private/authorization.txt`,
      );
      const bytes = new Uint8Array([1]);
      const result = await uploadBytes(reference, bytes);
      return {
        generation: result.metadata.generation,
        bytes: [...new Uint8Array(await getBytes(reference))],
      };
    });
  },
  deniedStorage() {
    requireStorageRole("anonymous");
    return producers.track(
      () =>
        uploadBytes(
          storageRef(storage, `${input.venue}/private/denied.txt`),
          new Uint8Array([1]),
        ),
      false,
      unauthorized,
    );
  },
  privateRead() {
    requireStorageRole("anonymous");
    return producers.track(
      () =>
        getBytes(
          storageRef(storage, `${input.venue}/private/authorization.txt`),
        ),
      false,
      unauthorized,
    );
  },
  privateList() {
    requireStorageRole("anonymous");
    return producers.track(
      () => listAll(storageRef(storage, `${input.venue}/private`)),
      false,
      unauthorized,
    );
  },
  publicRead() {
    requireStorageRole("anonymous");
    return producers.track(async () => [
      ...new Uint8Array(
        await getBytes(storageRef(storage, nestedMediaPaths(input)[0])),
      ),
    ]);
  },
  dispose(timeoutMs: number) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 20000)
      return Promise.reject(new Error("Invalid nested disposal bound."));
    if (disposePromise) return disposePromise;
    retiring = true;
    const deadline = Date.now() + timeoutMs;
    disposePromise = (async () => {
      try {
        root?.unmount();
      } catch {
        producers.failures.push("Nested provider unmount failed.");
      } finally {
        root = undefined;
      }
      await producers.drain(deadline);
      subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
      restore();
      goOffline(database);
      await beforeDeadline(deleteApp(app), deadline);
      disposed = true;
    })();
    return disposePromise;
  },
};
declare global {
  interface Window {
    nestedHarness: typeof harness;
  }
}
window.nestedHarness = harness;

function Consumers() {
  const value = useFirebaseState();
  useLayoutEffect(() => {
    api = trackCommands(value);
  }, [value]);
  const current = useDeferredAsset(value.controller.currentAsset);
  return (
    <>
      <div data-testid="current">
        {current && <PlaybackAsset current={current} />}
      </div>
      <div data-testid="queue">
        {Object.values(value.controller.queues).flatMap((queue) =>
          queue.items.map((item) => (
            <Asset key={`${queue.id}-${item.key}`} asset={item} thumbnail />
          )),
        )}
      </div>
      <Team teamName="homeTeam" />
      <SubstitutionInfo />
      <MatchLifecycle />
    </>
  );
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
      <Consumers />
    </FirebaseStateProvider>
  );
}
