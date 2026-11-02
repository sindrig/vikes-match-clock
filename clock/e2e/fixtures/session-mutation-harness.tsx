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
};
let api: Api;
let local: LocalApi;
let retained: Api;
let openScorer: () => void;
let openClub: () => void;
let openTheme: () => void;
let connected = false;
onValue(ref(database, ".info/connected"), (snapshot) => {
  connected = snapshot.val() === true;
});
let mediaGate: Promise<void> | null = null;
let releaseMedia: () => void = () => undefined;
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
    return original(...args);
  };
}
const originalDownload = storageHelpers.getDownloadURL;
storageHelpers.getDownloadURL = async (path) => {
  const result = await originalDownload(path);
  if (mediaGate && (/\/players\//.test(path) || /\/club-logos\//.test(path))) {
    counts.mediaWaiting++;
    await mediaGate;
  }
  return result;
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
  reset: () => {
    counts.ordinary = 0;
    counts.auditOnly = 0;
    counts.sdk.length = 0;
    counts.mediaWaiting = 0;
    counts.succeeded = 0;
    counts.failed = 0;
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
  armMedia: () => {
    mediaGate = new Promise((resolve) => {
      releaseMedia = resolve;
    });
  },
  releaseMedia: () => {
    releaseMedia();
    mediaGate = null;
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
  queueRoundTrip: () => {
    const id = api.createQueue("Fresh queue");
    api.addItemsToQueue(id, [
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
    const first = api.createQueue("First rapid queue");
    const second = api.createQueue("Second rapid queue");
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
};
export type SessionMutationHarness = typeof harness;
declare global {
  interface Window {
    sessionMutationHarness: SessionMutationHarness;
  }
}
window.sessionMutationHarness = harness;

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
