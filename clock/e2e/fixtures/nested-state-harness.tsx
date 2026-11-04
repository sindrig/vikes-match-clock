// Local emulator-only entrypoint. No fixture is included in the live bundle.
import { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { deleteApp, initializeApp } from "firebase/app";
import { signInWithEmailAndPassword } from "firebase/auth";
import { ref, set } from "firebase/database";
import {
  connectStorageEmulator,
  getStorage,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";

import { app, auth, database, storageHelpers } from "../../src/firebase";
import {
  backfillOverlayGenerations,
  backfillStorageGenerations,
} from "../../src/perimeter/media";
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
import Team from "../../src/controller/asset/team/Team";
import SubstitutionInfo from "../../src/controller/asset/queue/SubstitutionInfo";
import MatchLifecycle from "../../src/match/MatchLifecycle";

if (app.options.projectId !== "vikes-match-clock-test")
  throw new Error("This fixture requires local emulators");

type Api = ReturnType<typeof useFirebaseState>;
let api: Api;
let attempts = 0;
const transport: Array<{
  method: "put" | "merge";
  path: unknown;
  data: unknown;
}> = [];
type Server = Record<"put" | "merge", (...args: unknown[]) => unknown>;
// Observe the actual SDK transport, without replacing its authorization,
// local echoes, transaction validation or server acknowledgements.
ref(database);
const server = (database as unknown as { _repoInternal: { server_: Server } })
  ._repoInternal.server_;
for (const method of ["put", "merge"] as const) {
  const original = server[method].bind(server);
  server[method] = (...args) => {
    attempts += 1;
    transport.push({ method, path: args[0], data: structuredClone(args[1]) });
    return original(...args);
  };
}
const harness = {
  get commands() {
    return api;
  },
  snapshot: () => ({
    controller: api.controller,
    match: api.match,
    view: api.view,
    perimeterOverlay: api.perimeterOverlay,
    perimeterAdLayout: api.perimeterAdLayout,
    mediaPairs: api.mediaPairs,
    eligible: api.writeEligible,
    attempts,
    transport,
  }),
  resetAttempts: () => {
    attempts = 0;
    transport.length = 0;
  },
  login: (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password).then(() => undefined),
  denied: () =>
    set(ref(database, "states/audit246-denied/controller/playing"), true),
  seedCurrent: (current: unknown) =>
    set(ref(database, "states/audit246/controller/currentAsset"), current),
  seedMedia: async () => {
    const pairId = "11111111-1111-4111-8111-111111111111";
    const paths = [
      "audit246/perimeter/base-left.gif",
      "audit246/perimeter/base-right.gif",
      `audit246/perimeter-overlays/${pairId}/48/pair-left.gif`,
      `audit246/perimeter-overlays/${pairId}/40/pair-right.gif`,
    ];
    const bytes = Uint8Array.from(
      atob("R0lGODlhAQABAIAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=="),
      (char) => char.charCodeAt(0),
    );
    const generations: Record<string, string> = {};
    for (const path of paths) {
      const result = await storageHelpers.uploadBytes(path, bytes, {
        contentType: "image/gif",
      });
      generations[`gs://${app.options.storageBucket}/${path}`] =
        result.metadata.generation;
    }
    return {
      pairId,
      paths,
      generations,
      mainScreenUrl: await storageHelpers.getDownloadURL(paths[0]!),
    };
  },
  qualifyMedia: async () => {
    if (!api.perimeterOverlay || !api.perimeterAdLayout)
      throw new Error("Expected saved media");
    const reads: string[] = [];
    const generation = async (source: string) => {
      reads.push(source);
      return (await storageHelpers.getMetadata(source)).generation;
    };
    return {
      overlay: await backfillOverlayGenerations(
        api.perimeterOverlay,
        generation,
      ),
      layout: await backfillStorageGenerations(
        api.perimeterAdLayout,
        generation,
      ),
      reads,
    };
  },
  deniedStorage: async () => {
    const anonymous = initializeApp(app.options, "audit246-anonymous");
    try {
      const storage = getStorage(anonymous);
      connectStorageEmulator(storage, "127.0.0.1", 9199);
      await uploadBytes(
        storageRef(storage, "audit246/private/denied.txt"),
        new Uint8Array([1]),
      );
    } finally {
      await deleteApp(anonymous);
    }
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
    api = value;
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
createRoot(document.getElementById("root")!).render(
  <LocalStateProvider>
    <Bridge />
  </LocalStateProvider>,
);
