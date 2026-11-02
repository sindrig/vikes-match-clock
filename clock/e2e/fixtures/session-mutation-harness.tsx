// Dev-server-only fixture: exercises real providers, forms, SDKs and rules.
// No test hooks or instrumentation are included in the production entrypoint.
import { useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { signInWithEmailAndPassword } from "firebase/auth";
import { ref, set, goOffline, goOnline, onValue } from "firebase/database";
import { auth, app, database, storageHelpers } from "../../src/firebase";
import { firebaseDatabase } from "../../src/firebaseDatabase";
import {
  FirebaseStateProvider,
  useFirebaseState,
} from "../../src/contexts/FirebaseStateContext";
import {
  LocalStateProvider,
  useLocalState,
} from "../../src/contexts/LocalStateContext";
import ClubOverrideForm from "../../src/controller/ClubOverrideForm";
import GoalScorerDialog from "../../src/controller/GoalScorerDialog";
import PerimeterControl from "../../src/controller/PerimeterControl";
import ResyncNotice from "../../src/controller/ResyncNotice";
import ThemeEditorModal from "../../src/controller/theme/ThemeEditor";
import AssetController from "../../src/controller/asset/AssetController";
import TeamAssetController from "../../src/controller/asset/team/TeamAssetController";
import HomeTeamQuickActions from "../../src/controller/HomeTeamQuickActions";
import MediaManager from "../../src/controller/media/MediaManager";
import QueuePicker from "../../src/controller/asset/queue/QueuePicker";
import { useQueuePickerActions } from "../../src/controller/asset/queue/useQueuePickerActions";
import { getPlayerAssetObject } from "../../src/controller/asset/team/assetHelpers";
import { DEFAULT_THEME } from "../../src/constants";
import { DEFAULT_BRIGHTNESS_AUTO_CONFIG } from "../../src/lib/autoBrightness";
import type { CountdownCompletionObservation } from "../../src/lib/conditionalTransitions";
import "../../src/index.css";

if (app.options.projectId !== "vikes-match-clock-test") {
  throw new Error("Session mutation fixture requires local emulators.");
}

type Api = ReturnType<typeof useFirebaseState>;
type LocalApi = ReturnType<typeof useLocalState>;
const counts = {
  ordinary: 0,
  auditOnly: 0,
  sdk: [] as string[],
  mediaWaiting: 0,
  succeeded: 0,
  failed: 0,
  navigated: 0,
};
let api: Api;
let local: LocalApi;
let retained: Api;
let openScorer: () => void;
let openClub: () => void;
let openTheme: () => void;
let preparePicker: () => void;
let failPreparation = false;
const observations: unknown[] = [];
let stopObserving: () => void = () => undefined;
let connected = false;
onValue(ref(database, ".info/connected"), (snapshot) => {
  connected = snapshot.val() === true;
});
const mediaGates = new Map<
  string,
  { promise: Promise<void>; release: () => void }
>();
let holdAcknowledgements = false;
const acknowledgements: {
  received: boolean;
  delivered: boolean;
  status: string;
  release?: () => void;
}[] = [];
const playlistResponses = new Map<
  string,
  (response: {
    result: { items: { contentDetails: { videoId: string } }[] };
  }) => void
>();
let activeMediaGate = "default";
const originalAudited = firebaseDatabase.writeAudited;
const originalAuditOnly = firebaseDatabase.writeAuditOnly;
firebaseDatabase.writeAudited = (...args) => {
  counts.ordinary++;
  const result = originalAudited(...args);
  void result.then(
    () => {
      counts.succeeded++;
    },
    () => {
      counts.failed++;
    },
  );
  return result;
};
firebaseDatabase.writeAuditOnly = (...args) => {
  counts.auditOnly++;
  return originalAuditOnly(...args);
};
// Count submissions below the audited helper too, including direct put/merge
// attempts and offline submissions. Preserve the receiver and actual SDK I/O.
type ServerMethod = (...args: unknown[]) => unknown;
ref(database); // Start the lazy SDK repository before wrapping its server.
const server = (
  database as unknown as {
    _repoInternal: { server_: { put: ServerMethod; merge: ServerMethod } };
  }
)._repoInternal.server_;
for (const name of ["put", "merge"] as const) {
  const original = server[name].bind(server);
  server[name] = (...args) => {
    counts.sdk.push(`${name}:${String(args[0])}`);
    const callback = args[2] as ((...result: unknown[]) => void) | undefined;
    if (
      holdAcknowledgements &&
      name === "merge" &&
      typeof callback === "function"
    ) {
      const acknowledgement: (typeof acknowledgements)[number] = {
        received: false,
        delivered: false,
        status: "pending",
      };
      acknowledgements.push(acknowledgement);
      // Delay only delivery to the SDK. The real emulator still decides the
      // outcome, commits state/audit atomically and delivers subscription echoes.
      args[2] = (...result: unknown[]) => {
        acknowledgement.received = true;
        acknowledgement.status = String(result[0]);
        acknowledgement.release = () => {
          acknowledgement.delivered = true;
          callback(...result);
        };
      };
    }
    return original(...args);
  };
}
const originalDownload = storageHelpers.getDownloadURL;
storageHelpers.getDownloadURL = (path) => {
  // A synchronous preparation fault (before a promise exists), separate from
  // missing player photos, which intentionally fall back to text-only cards.
  if (failPreparation && /\/players\//.test(path)) {
    failPreparation = false;
    throw new Error("Injected media preparation failure");
  }
  const gate = mediaGates.get(activeMediaGate);
  return originalDownload(path).then(async (result) => {
    if (gate && (/\/players\//.test(path) || /\/club-logos\//.test(path))) {
      counts.mediaWaiting++;
      await gate.promise;
    }
    return result;
  });
};
function hidden(value: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value });
  document.dispatchEvent(new Event("visibilitychange"));
}
export const harness = {
  emulator: app.options.databaseURL,
  snapshot: () => ({
    ready: api.ready,
    eligible: api.writeEligible,
    freshness: api.writeFreshness,
    location: local.listenPrefix,
    match: api.match,
    controller: api.controller,
    view: api.view,
    connected,
  }),
  counts,
  holdAcknowledgements: () => {
    holdAcknowledgements = true;
  },
  acknowledgements: () =>
    acknowledgements.map(({ received, delivered, status }) => ({
      received,
      delivered,
      status,
    })),
  releaseAcknowledgement: (index: number) => {
    const acknowledgement = acknowledgements[index];
    if (!acknowledgement?.release || acknowledgement.delivered)
      throw new Error(`Acknowledgement ${String(index)} is not held.`);
    acknowledgement.release();
  },
  installPlaylists: () => {
    window.gapi = {
      load: (_api, callback) => callback(),
      client: {
        init: () => Promise.resolve(),
        request: ({ params }) =>
          new Promise((resolve) => {
            const id = params.playlistId;
            if (!id) throw new Error("Missing playlist ID.");
            playlistResponses.set(id, resolve);
          }),
      },
    };
  },
  pendingPlaylists: () => [...playlistResponses.keys()],
  releasePlaylist: (id: string, videoId: string) => {
    const resolve = playlistResponses.get(id);
    if (!resolve) throw new Error(`Playlist ${id} was not requested.`);
    playlistResponses.delete(id);
    resolve({ result: { items: [{ contentDetails: { videoId } }] } });
  },
  get commands() {
    return api;
  },
  get retainedCommands() {
    return retained;
  },
  observations,
  observe: (location: string) => {
    stopObserving();
    observations.length = 0;
    stopObserving = onValue(ref(database, `states/${location}`), (snapshot) => {
      observations.push(snapshot.val());
    });
  },
  failPreparation: () => {
    failPreparation = true;
  },
  preparePicker: () => preparePicker(),
  reset: () => {
    counts.ordinary = 0;
    counts.auditOnly = 0;
    counts.sdk.length = 0;
    counts.mediaWaiting = 0;
    counts.succeeded = 0;
    counts.failed = 0;
    counts.navigated = 0;
  },
  login: (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password).then(() => undefined),
  logout: () => local.logout(),
  venue: (location: string) => local.setListenPrefix(location),
  aba: (other: string) => {
    const original = local.listenPrefix;
    local.setListenPrefix(other);
    local.setListenPrefix(original);
  },
  hide: hidden,
  offline: () => {
    window.dispatchEvent(new Event("offline"));
    goOffline(database);
  },
  online: () => {
    goOnline(database);
    window.dispatchEvent(new Event("online"));
  },
  pagehide: () => window.dispatchEvent(new Event("pagehide")),
  openScorer: () => openScorer(),
  openClub: () => openClub(),
  openTheme: () => openTheme(),
  // Pure SDK disconnect/reconnect, without browser offline/online events.
  disconnect: () => goOffline(database),
  reconnect: () => goOnline(database),
  armMedia: (id = "default") => {
    let release: () => void = () => undefined;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    mediaGates.set(id, { promise, release });
    activeMediaGate = id;
  },
  releaseMedia: (id = "default") => {
    mediaGates.get(id)?.release();
    mediaGates.delete(id);
  },
  retain: () => {
    retained = api;
  },
  brightness: (percent: number) => api.setPerimeterBrightness(percent),
  oldCommands: async () => {
    retained.addGoal("home");
    retained.setBackground("Obsolete");
    const results = await Promise.allSettled([
      retained.renderAsset(null),
      retained.setPerimeterBrightness(77),
      retained.setPerimeterAdLayout(null),
      retained.setPerimeterBrightnessAuto(DEFAULT_BRIGHTNESS_AUTO_CONFIG),
    ]);
    return results.map((result) => result.status);
  },
  fresh: async () => {
    api.addGoal("home");
    await api.setPerimeterBrightness(60);
    await api.setPerimeterBrightnessAuto({
      ...DEFAULT_BRIGHTNESS_AUTO_CONFIG,
      enabled: true,
    });
  },
  queueRoundTrip: async () => {
    const id = await api.createQueue("Fresh queue", [
      {
        type: "NO_IMAGE_PLAYER",
        key: "fresh-player",
        name: "Jón",
        number: 7,
        teamName: "Víkingur R",
      },
    ]);
    api.playQueue(id);
    return id;
  },
  rapidOrdinary: async () => {
    api.addGoal("home");
    api.addGoal("home");
    const [first, second] = await Promise.all([
      api.createQueue("First rapid queue"),
      api.createQueue("Second rapid queue"),
    ]);
    for (const key of ["rapid-one", "rapid-two"]) {
      api.addItemsToQueue(first, [{ type: "NO_IMAGE_PLAYER", key, name: key }]);
    }
    await Promise.all([
      api.saveCustomPreset("rapid-one", {
        name: "First",
        theme: DEFAULT_THEME,
      }),
      api.saveCustomPreset("rapid-two", {
        name: "Second",
        theme: DEFAULT_THEME,
      }),
    ]);
    return { first, second };
  },
  conditional: (observed: CountdownCompletionObservation) =>
    api.completeCountdownIfCurrent(observed),
  rawWrite: (path: string, value: unknown) =>
    set(ref(database, path), value).then(
      () => "accepted",
      () => "denied",
    ),
  storageRead: (path: string) =>
    storageHelpers.getDownloadURL(path).then(
      () => "accepted",
      () => "denied",
    ),
  storageWrite: (path: string) =>
    storageHelpers.uploadBytes(path, new Uint8Array([1])).then(
      () => "accepted",
      () => "denied",
    ),
};
export type SessionMutationHarness = typeof harness;
declare global {
  interface Window {
    sessionMutationHarness: SessionMutationHarness;
  }
}
window.sessionMutationHarness = harness;

function PreparedPicker() {
  const { controller } = useFirebaseState();
  const { listenPrefix } = useLocalState();
  const { pending, selectAssets } = useQueuePickerActions();
  useLayoutEffect(() => {
    preparePicker = () =>
      selectAssets([
        getPlayerAssetObject({
          listenPrefix,
          teamName: "Víkingur R",
          player: { id: 10, name: "Jón", number: 7 },
        }),
      ]);
  }, [selectAssets, listenPrefix]);
  return pending && <QueuePicker queues={controller.queues} {...pending} />;
}

function Controls() {
  const value = useFirebaseState();
  const localValue = useLocalState();
  const [scorer, setScorer] = useState(false);
  const [club, setClub] = useState(false);
  const [theme, setTheme] = useState(false);
  useLayoutEffect(() => {
    api = value;
    local = localValue;
    openScorer = () => setScorer(true);
    openClub = () => setClub(true);
    openTheme = () => setTheme(true);
  }, [value, localValue]);
  const queueFixture = new URLSearchParams(window.location.search).get(
    "queues",
  );
  if (queueFixture)
    return (
      <>
        <output data-testid="eligibility">{String(value.writeEligible)}</output>
        <ResyncNotice />
        {queueFixture === "team" && (
          <TeamAssetController
            previousView={() => {
              counts.navigated++;
            }}
          />
        )}
        {queueFixture === "sub" && <HomeTeamQuickActions />}
        {queueFixture === "asset" && <AssetController />}
        {queueFixture === "media" && value.writeEligible && <MediaManager />}
        {queueFixture === "prepared" && <PreparedPicker />}
      </>
    );
  return (
    <>
      <output data-testid="eligibility">{String(value.writeEligible)}</output>
      <ResyncNotice />
      <GoalScorerDialog
        open={scorer}
        players={[{ id: 10, name: "Jón", number: 7, show: true }]}
        teamName="Víkingur R"
        onClose={() => setScorer(false)}
      />
      <ClubOverrideForm
        open={club}
        editOverride={{
          id: "club",
          override: {
            name: "Original Club",
            clubId: "-1",
            isOverride: false,
            logoUrl:
              "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
          },
        }}
        onClose={() => setClub(false)}
      />
      <PerimeterControl standalone />
      <ThemeEditorModal open={theme} onClose={() => setTheme(false)} />
    </>
  );
}
function Bridge() {
  const { auth: currentAuth, listenPrefix, mutationSession } = useLocalState();
  return (
    <FirebaseStateProvider
      listenPrefix={listenPrefix}
      isAuthenticated={!currentAuth.isEmpty && currentAuth.isLoaded}
      uid={currentAuth.uid}
      mutationSession={mutationSession}
      screenKey={null}
    >
      <Controls />
    </FirebaseStateProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <LocalStateProvider>
    <Bridge />
  </LocalStateProvider>,
);
