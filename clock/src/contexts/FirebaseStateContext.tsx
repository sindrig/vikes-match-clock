import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useRef,
  useMemo,
  useLayoutEffect,
  useSyncExternalStore,
} from "react";
import { database, storageHelpers, FIREBASE_STORAGE_BUCKET } from "../firebase";
import {
  ref,
  onValue,
  runTransaction,
  serverTimestamp,
} from "firebase/database";
import {
  Match,
  InjuryTimeDisplayMode,
  ControllerState,
  ViewState,
  ListenersState,
  ViewPort,
  ThemeConfig,
  CustomPreset,
  Asset,
  MainScreenMediaAsset,
  Player,
  Roster,
  TwoMinPenalty,
  QueueState,
  ClubOverride,
  PerimeterState,
  PerimeterOverlay,
  PerimeterMediaPair,
  PerimeterGoalVideoConfig,
  ScorerCelebrationStyle,
  PlayerBandStyle,
  SubstitutionBandStyle,
  PerimeterAdLayout,
  AuditStateArea,
  PerimeterBrightnessStatus,
  PerimeterBrightnessAuto,
  PerimeterBrightnessAutoConfig,
} from "../types";
import {
  firebaseDatabase,
  generateClubOverrideId,
  type AuditEventPayload,
} from "../firebaseDatabase";
import { MutationSession, type WriteFreshness } from "../lib/mutationSession";
import {
  PendingQueueCreations,
  type QueueDependencies,
} from "../lib/pendingQueueCreations";
import { validateBrightnessAutoConfig } from "../lib/autoBrightness";
import { Sports, DEFAULT_HALFSTOPS, VIEWS } from "../constants";
import { msUntilMatchStart } from "../utils/timeUtils";
import {
  isHalftimeTransitionEligible,
  roundMillisToSeconds,
} from "../utils/matchUtils";
import {
  countdownCompletionPrecondition,
  countdownCompletionTransition,
  halfStopPrecondition,
  halfStopTransition,
  timeoutExpiryPrecondition,
  timeoutExpiryTransition,
  penaltyExpiryPrecondition,
  penaltyExpiryTransition,
  timedAssetCompletionPrecondition,
  CountdownCompletionObservation,
  HalfStopObservation,
  TimeoutExpiryObservation,
  PenaltyExpiryObservation,
  TimedAssetCompletionObservation,
} from "../lib/conditionalTransitions";
import clubIds from "../club-ids";
import assetTypes from "../controller/asset/AssetTypes";
import {
  parseLocations,
  parseMatch,
  parseController,
  parseView,
  parseClubOverrides,
  parsePerimeterState,
  parsePerimeterOverlay,
  parsePerimeterMediaPairs,
  parseMainScreenMediaAsset,
  parsePerimeterGoalVideo,
  parsePerimeterAdLayout,
  parsePerimeterBrightness,
  parsePerimeterBrightnessStatus,
  parsePerimeterBrightnessAuto,
} from "./firebaseParsers";
import { playerChildKey } from "./nestedParsers";
import { applyStateDiff } from "../lib/stateDiff";

const HALFTIME_DURATION_MS = 15 * 60 * 1000;

const normalizeClubKey = (name: string): string => name.replace(/\.+$/, "");

const findClubOverrideByName = (
  overrides: Record<string, ClubOverride>,
  name: string,
): ClubOverride | undefined => {
  const normalizedName = normalizeClubKey(name);

  return Object.values(overrides).find(
    (override) => normalizeClubKey(override.name) === normalizedName,
  );
};

const defaultMatch: Match = {
  homeScore: 0,
  awayScore: 0,
  started: 0,
  timeElapsed: 0,
  halfStops: DEFAULT_HALFSTOPS[Sports.Football],
  homeTeam: "Víkingur R",
  awayTeam: "",
  homeTeamId: 103,
  awayTeamId: 0,
  injuryTime: 0,
  matchType: Sports.Football,
  home2min: [],
  away2min: [],
  timeout: 0,
  homeTimeouts: 0,
  awayTimeouts: 0,
  buzzer: false,
  countdown: false,
  halftimeCountdown: false,
  injuryTimeDisplayMode: "full",
};

const defaultController: ControllerState = {
  queues: {},
  activeQueueId: null,
  playing: false,
  assetView: "assets",
  view: "idle",
  roster: { home: [], away: [] },
  currentAsset: null,
  refreshToken: "",
};

const defaultView: ViewState = {
  vp: { style: { height: 1080, width: 1920 }, name: "1080p", key: "viken" },
  background: "Default",
};

const defaultListeners: ListenersState = {
  available: [],
  venues: {},
  screens: [],
};

const defaultClubOverrides: Record<string, ClubOverride> = {};

const defaultPerimeter: PerimeterState = { enabled: false, state: "off" };

export function computeControllerDiff(
  prev: ControllerState,
  next: ControllerState,
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};

  for (const key of Object.keys(next) as Array<keyof ControllerState>) {
    if (key === "queues") {
      if (prev.queues !== next.queues) {
        const prevQueues = prev.queues;
        const nextQueues = next.queues;

        for (const [queueId, newQueue] of Object.entries(nextQueues)) {
          const oldQueue = prevQueues[queueId];
          if (!oldQueue) {
            diff[`queues/${queueId}`] = newQueue;
          } else if (oldQueue !== newQueue) {
            for (const field of Object.keys(newQueue) as Array<
              keyof QueueState
            >) {
              if (oldQueue[field] !== newQueue[field]) {
                diff[`queues/${queueId}/${field}`] = newQueue[field];
              }
            }
          }
        }

        for (const queueId of Object.keys(prevQueues)) {
          if (!Object.prototype.hasOwnProperty.call(nextQueues, queueId)) {
            diff[`queues/${queueId}`] = null;
          }
        }
      }
      continue;
    }

    const oldVal = prev[key];
    const newVal = next[key];
    if (oldVal !== newVal) {
      diff[key] = newVal;
    }
  }

  return diff;
}

type ControllerUpdates = Partial<Omit<ControllerState, "currentAsset">> & {
  currentAsset?: null;
};

interface QueueOptions {
  cycle?: boolean;
}

interface SubstitutionIntent {
  side: "home" | "away";
  outgoing: Player;
  incoming: Player;
  asset: Asset;
}

interface FirebaseStateContextType {
  match: Match;
  controller: ControllerState;
  view: ViewState;
  listeners: ListenersState;
  clubOverrides: Record<string, ClubOverride>;
  perimeter: PerimeterState;
  ready: boolean;

  updateMatch: (updates: Partial<Match>) => void;
  startMatch: () => void;
  pauseMatch: (isHalfEnd?: boolean) => void;
  resetMatch: () => void;
  addGoal: (team: "home" | "away") => void;
  addPenalty: (
    team: "home" | "away",
    key: string,
    penaltyLength: number,
  ) => void;
  removePenalty: (key: string) => void;
  addToPenalty: (key: string, toAdd: number) => void;
  updateHalfLength: (currentValue: number, newValue: string) => void;
  adjustMatchTime: (deltaMs: number) => void;
  setHalfStops: (halfStops: number[], mode: InjuryTimeDisplayMode) => void;
  matchTimeout: (team: "home" | "away") => void;
  removeTimeout: () => void;
  buzz: (on: boolean) => void;
  countdown: () => void;
  startHalftimeCountdown: () => void;
  stopHalftimeCountdown: () => void;
  completeCountdownIfCurrent: (
    observed: CountdownCompletionObservation,
  ) => Promise<boolean>;
  applyHalfStopIfCurrent: (observed: HalfStopObservation) => Promise<boolean>;
  removeTimeoutIfCurrent: (
    observed: TimeoutExpiryObservation,
  ) => Promise<boolean>;
  removePenaltyIfCurrent: (
    observed: PenaltyExpiryObservation,
  ) => Promise<boolean>;
  completeAssetIfCurrent: (
    observed: TimedAssetCompletionObservation,
  ) => Promise<boolean>;
  writeEligible: boolean;
  writeFreshness: WriteFreshness;
  updateRedCards: (home: number, away: number) => void;
  getServerTime: () => number;

  updateController: (updates: ControllerUpdates) => void;
  selectView: (view: string) => void;
  selectAssetView: (assetView: string) => void;
  createQueue: (
    name: string,
    items?: Asset[],
    options?: QueueOptions,
  ) => Promise<string>;
  replaceQueue: (
    name: string,
    items: Asset[],
    options?: QueueOptions,
  ) => Promise<string>;
  appendSubstitutionAndActivate: (intent: SubstitutionIntent) => Promise<void>;
  deleteQueue: (queueId: string) => void;
  renameQueue: (queueId: string, name: string) => void;
  reorderQueues: (orderedIds: string[]) => void;
  addItemsToQueue: (queueId: string, assets: Asset[]) => Promise<void>;
  removeItemFromQueue: (queueId: string, assetKey: string) => void;
  reorderItemsInQueue: (queueId: string, items: Asset[]) => void;
  updateQueueSettings: (
    queueId: string,
    settings: Partial<Pick<QueueState, "autoPlay" | "imageSeconds" | "cycle">>,
  ) => void;
  playQueue: (queueId: string) => void;
  activateQueue: (queueId: string) => void;
  stopPlaying: () => void;
  showItemNow: (asset: Asset) => void;
  setPlaying: (playing: boolean) => void;
  renderAsset: (asset: Asset | null) => Promise<void>;
  showNextAsset: () => void;
  remoteRefresh: () => void;
  setRoster: (roster: Roster) => void;
  editPlayer: (
    side: "home" | "away",
    idx: number,
    updatedPlayer: Partial<Player>,
  ) => void;
  deletePlayer: (side: "home" | "away", idx: number) => void;
  addPlayer: (side: "home" | "away") => void;
  clearRoster: () => void;
  selectTab: (tab: string) => void;

  updateView: (updates: Partial<ViewState>) => void;
  setViewPort: (vp: ViewPort) => void;
  setBackground: (background: string) => void;
  setIdleImage: (idleImage: string) => void;
  setIdleAd: (idleAd: string | null) => void;
  setBlackoutStart: (blackoutStart: string | undefined) => void;
  setBlackoutEnd: (blackoutEnd: string | undefined) => void;
  setGoalGifSettings: (settings: {
    goalGif1?: string | null;
    goalGif2?: string | null;
    goalGifSameImage?: boolean;
    showGoalscorerName?: boolean;
    showGoalscorerNumber?: boolean;
    flickerInitialOn?: number;
    flickerInitialOff?: number;
    flickerOnGrowth?: number;
    flickerOffDecay?: number;
    flickerCycles?: number;
    flickerJitter?: number;
    homeTeamRevealBackground?: string | null;
  }) => void;
  setTheme: (theme: ThemeConfig | undefined) => void;
  setThemePreset: (preset: string | undefined) => void;
  saveCustomPreset: (id: string, preset: CustomPreset) => Promise<void>;
  deleteCustomPreset: (id: string) => void;

  saveClubOverride: (
    override: Omit<ClubOverride, "logoUrl"> & { logoFile: File },
  ) => Promise<void>;
  commitClubOverride: (
    id: string,
    override: ClubOverride,
    action:
      | "clubOverrides.create"
      | "clubOverrides.update"
      | "clubOverrides.save",
  ) => Promise<void>;
  mutationError: string | null;
  dismissMutationError: () => void;
  deleteClubOverride: (id: string) => Promise<void>;

  setPerimeterState: (state: PerimeterState["state"]) => void;
  skipPerimeterCue: () => void;
  restartPerimeterDisplays: () => void;
  setPerimeterOverlay: (overlay: PerimeterOverlay) => Promise<void>;
  clearPerimeterOverlay: () => void;
  setPerimeterAdLayout: (layout: PerimeterAdLayout | null) => Promise<void>;
  createPerimeterMediaPair: (
    pairId: string,
    pair: PerimeterMediaPair,
  ) => Promise<void>;
  deletePerimeterMediaPair: (pairId: string) => Promise<void>;
  setPerimeterMediaPairMainScreenAsset: (
    pairId: string,
    asset: MainScreenMediaAsset | null,
  ) => Promise<void>;
  setPerimeterGoalVideo: (
    config: PerimeterGoalVideoConfig | null,
  ) => Promise<void>;
  setPerimeterScorerCelebration: (
    style: ScorerCelebrationStyle,
  ) => Promise<void>;
  setPerimeterPlayerDisplayStyle: (style: PlayerBandStyle) => Promise<void>;
  setPerimeterSubstitutionStyle: (
    style: SubstitutionBandStyle,
  ) => Promise<void>;
  mediaPairs: Record<string, PerimeterMediaPair>;
  setPerimeterIdleClock: (enabled: boolean) => Promise<void>;
  perimeterGoalVideo: PerimeterGoalVideoConfig | null;
  perimeterOverlay: PerimeterOverlay | null;
  perimeterAdLayout: PerimeterAdLayout | null;
  perimeterBrightness: number | null;
  perimeterBrightnessStatus: PerimeterBrightnessStatus | null;
  setPerimeterBrightness: (percent: number) => Promise<void>;
  perimeterBrightnessAuto: PerimeterBrightnessAuto | null;
  setPerimeterBrightnessAuto: (
    config: PerimeterBrightnessAutoConfig,
  ) => Promise<void>;
}

const FirebaseStateContext = createContext<FirebaseStateContextType | null>(
  null,
);

export const getStateWithAddedItems = (
  prev: ControllerState,
  queueId: string,
  assets: Asset[],
): ControllerState => {
  const queue = prev.queues[queueId];
  if (!queue) return prev;

  const existingKeys = new Set(queue.items.map((i) => i.key));
  const validAssetKeys = Object.keys(assetTypes);
  const newItems = assets.filter(
    (asset) =>
      validAssetKeys.indexOf(asset.type) !== -1 &&
      asset.key &&
      !existingKeys.has(asset.key),
  );

  if (newItems.length === 0) return prev;

  return {
    ...prev,
    queues: {
      ...prev.queues,
      [queueId]: { ...queue, items: [...queue.items, ...newItems] },
    },
  };
};

export const getStateShowingNextAsset = (
  state: ControllerState,
  occurrenceId: string,
): ControllerState => {
  const { activeQueueId } = state;
  const newState: ControllerState = {
    ...state,
    queues: { ...state.queues },
  };

  if (!activeQueueId) {
    newState.playing = false;
    newState.currentAsset = null;
    return newState;
  }

  const activeQueue = state.queues[activeQueueId];
  if (!activeQueue) {
    newState.playing = false;
    newState.currentAsset = null;
    newState.activeQueueId = null;
    return newState;
  }

  if (activeQueue.items.length === 0) {
    newState.playing = false;
    newState.currentAsset = null;
    return maybeAutoDeleteQueue(newState, activeQueueId);
  }

  const items = [...activeQueue.items];
  const nextAsset = items.shift();
  if (!nextAsset) {
    newState.playing = false;
    newState.currentAsset = null;
    return newState;
  }

  const updatedItems = activeQueue.cycle ? [...items, nextAsset] : [...items];
  const updatedQueue: QueueState = {
    ...activeQueue,
    items: updatedItems,
  };

  newState.currentAsset = {
    asset: nextAsset,
    occurrenceId,
    time: activeQueue.autoPlay ? activeQueue.imageSeconds : null,
  };
  newState.playing = activeQueue.autoPlay;

  if (!activeQueue.cycle && updatedItems.length === 0) {
    newState.queues[activeQueueId] = updatedQueue;
    newState.playing = false;
    return newState;
  }

  newState.queues[activeQueueId] = updatedQueue;
  return newState;
};

export function maybeAutoDeleteQueue(
  state: ControllerState,
  queueId: string,
): ControllerState {
  const queue = state.queues[queueId];
  if (!queue || queue.cycle || queue.items.length > 0) {
    return state; // No deletion needed
  }

  // Delete non-cycling empty queue
  const queues = { ...state.queues };
  delete queues[queueId];

  const newState: ControllerState = { ...state, queues };

  // If deleted queue was active, clear active state
  if (state.activeQueueId === queueId) {
    newState.activeQueueId = null;
    newState.playing = false;
    newState.currentAsset = null;
  }

  return newState;
}

function getStateWithoutQueue(
  prev: ControllerState,
  queueId: string,
): ControllerState {
  if (!prev.queues[queueId]) return prev;
  const queues = { ...prev.queues };
  delete queues[queueId];
  const isActive = prev.activeQueueId === queueId;
  return {
    ...prev,
    queues,
    activeQueueId: isActive ? null : prev.activeQueueId,
    playing: isActive ? false : prev.playing,
    currentAsset: isActive ? null : prev.currentAsset,
  };
}

function getStateWithNewQueue(
  prev: ControllerState,
  id: string,
  name: string,
  items: Asset[],
  options?: QueueOptions,
): ControllerState {
  const orders = Object.values(prev.queues).map((queue) => queue.order);
  const queue: QueueState = {
    id,
    name,
    items: [],
    autoPlay: false,
    imageSeconds: 3,
    cycle: options?.cycle ?? true,
    order: orders.length ? Math.max(...orders) + 1 : 0,
  };
  return getStateWithAddedItems(
    { ...prev, queues: { ...prev.queues, [id]: queue } },
    id,
    items,
  );
}

interface FirebaseStateProviderProps {
  children: ReactNode;
  listenPrefix: string;
  isAuthenticated: boolean;
  screenKey: string | null;
  // Authenticated operator identity (Firebase Auth UID) used for audit events.
  // An authenticated command requires a nonempty UID, including in tests.
  uid?: string;
  mutationSession?: MutationSession;
}

export const FirebaseStateProvider: React.FC<FirebaseStateProviderProps> = ({
  children,
  listenPrefix,
  isAuthenticated,
  screenKey,
  uid,
  mutationSession,
}) => {
  const [ownSession] = useState(
    () =>
      new MutationSession({
        location: listenPrefix,
        authenticated: isAuthenticated,
        uid,
      }),
  );
  const session = mutationSession ?? ownSession;
  const origin = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const writeFreshness = origin.freshness;
  const setWriteFreshness = useCallback(
    (freshness: typeof writeFreshness) => session.setFreshness(freshness),
    [session],
  );
  useLayoutEffect(() => {
    session.setScope({
      location: listenPrefix,
      authenticated: isAuthenticated,
      uid,
    });
  }, [session, listenPrefix, isAuthenticated, uid]);
  useLayoutEffect(() => () => session.invalidate(), [session]);
  const [match, setMatch] = useState<Match>(defaultMatch);
  const [controller, setController] =
    useState<ControllerState>(defaultController);
  const [view, setView] = useState<ViewState>(defaultView);
  const [listeners, setListeners] = useState<ListenersState>(defaultListeners);
  const [clubOverrides, setClubOverrides] =
    useState<Record<string, ClubOverride>>(defaultClubOverrides);
  const [perimeter, setPerimeter] = useState<PerimeterState>(defaultPerimeter);
  const [perimeterOverlay, setOverlay] = useState<PerimeterOverlay | null>(
    null,
  );
  const [perimeterAdLayout, setPerimeterAdLayoutState] =
    useState<PerimeterAdLayout | null>(null);
  const [perimeterMediaPairs, setMediaPairs] = useState<
    Record<string, PerimeterMediaPair>
  >({});
  const [perimeterGoalVideo, setPerimeterGoalVideoState] =
    useState<PerimeterGoalVideoConfig | null>(null);
  const [perimeterBrightness, setPerimeterBrightnessState] = useState<
    number | null
  >(null);
  const [perimeterBrightnessStatus, setPerimeterBrightnessStatus] =
    useState<PerimeterBrightnessStatus | null>(null);
  const [perimeterBrightnessAuto, setPerimeterBrightnessAutoState] =
    useState<PerimeterBrightnessAuto | null>(null);
  const [ready, setReady] = useState(!listenPrefix);

  // Freshness barrier: a browser may only submit shared-state mutations while
  // it has confirmed current Firebase state for the selected venue.
  //
  // - "loading": the initial venue subscriptions have not all delivered yet.
  // - "ready": current and eligible to write.
  // - "hidden": the tab was hidden/paged out; mutations are blocked.
  // - "offline": connectivity was lost; mutations are blocked.
  // - "resyncing": the tab became visible/online again but has not yet
  //   received a post-resume authoritative snapshot.
  //
  // Eligibility is a barrier, NOT a second state store: Firebase remains the
  // single source of truth, and rendered values are unchanged. It only decides
  // whether THIS browser may submit a command.
  const resyncPendingRef = useRef(false);
  // Current Firebase connectivity, mirrored from `/.info/connected`. This is
  // the authoritative signal for whether the existing subscription epoch is
  // still live; `navigator.onLine` only reflects browser network state and is
  // not a reliable readiness gate.
  const firebaseConnectedRef = useRef(true);
  // True when the Firebase connection was observed dropping while the client
  // was suspended (hidden/offline). A resume that never observed a drop can
  // restore eligibility immediately; a resume after a real drop must wait for
  // a post-reconnect subscription delivery.
  const suspendedDropRef = useRef(false);
  const readyScopeRef = useRef<object | null>(null);

  const matchRef = useRef(match);
  const controllerRef = useRef(controller);
  const prevControllerViewRef = useRef<string | null>(null);
  const viewRef = useRef(view);
  const clubOverridesRef = useRef(clubOverrides);
  const serverTimeOffsetRef = useRef<number>(0);
  const [prevListenPrefix, setPrevListenPrefix] = useState(listenPrefix);

  // Reset ready when listenPrefix changes (using state comparison pattern per React docs)
  if (prevListenPrefix !== listenPrefix) {
    setPrevListenPrefix(listenPrefix);
    setReady(!listenPrefix);
    setPerimeterAdLayoutState(null);
    setMediaPairs({});
    setPerimeterGoalVideoState(null);
  }

  // Marks the end of a resume/reconnect epoch: a core subscription has
  // delivered a snapshot after the tab became visible or online again.
  const markSubscriptionDelivered = useCallback(() => {
    if (!resyncPendingRef.current) return;
    if (!firebaseConnectedRef.current) return;
    // Active subscription callbacks may prove resynchronization before all
    // initial venue snapshots arrive. Keep that proof; checkReady still owns
    // the all-required-snapshots gate for this scope.
    resyncPendingRef.current = false;
    suspendedDropRef.current = false;
    // A connected core delivery satisfies the existing recovery policy.
    // onValue does not expose server/cache provenance; this barrier does not
    // independently certify server freshness.
    // `navigator.onLine` is intentionally not consulted: it is unreliable and
    // a genuinely offline client simply never receives a delivery.
    if (
      readyScopeRef.current === session.getSnapshot().scope &&
      (typeof document === "undefined" || !document.hidden)
    ) {
      setWriteFreshness("ready");
    }
  }, [session, setWriteFreshness]);

  // Initial load becomes write-eligible inside checkReady (below), once all
  // required venue subscriptions have delivered — so no render-time ref reads
  // are needed here.

  // Any suspension or connectivity loss makes the client ineligible until a
  // fresh authoritative snapshot arrives. No writes are queued for replay.
  useEffect(() => {
    // A resume only needs to wait for a post-resume snapshot when the
    // Firebase connection actually dropped while the client was suspended.
    // If the connection stayed up (no `/.info/connected` false observed and
    // still connected now), the existing subscription epoch is still current,
    // so restore eligibility immediately instead of waiting for an `onValue`
    // delivery that will not come when no data changed while the tab was away.
    const restoreAfterUndroppedResume = () => {
      if (document.hidden) return;
      if (readyScopeRef.current !== session.getSnapshot().scope) return;
      if (firebaseConnectedRef.current && !suspendedDropRef.current) {
        resyncPendingRef.current = false;
        suspendedDropRef.current = false;
        setWriteFreshness("ready");
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        resyncPendingRef.current = false;
        suspendedDropRef.current ||= !firebaseConnectedRef.current;
        setWriteFreshness("hidden");
      } else {
        resyncPendingRef.current = true;
        setWriteFreshness("resyncing");
        restoreAfterUndroppedResume();
      }
    };
    const onPageHide = () => {
      resyncPendingRef.current = false;
      suspendedDropRef.current ||= !firebaseConnectedRef.current;
      setWriteFreshness("hidden");
    };
    const onOffline = () => {
      resyncPendingRef.current = true;
      suspendedDropRef.current ||= !firebaseConnectedRef.current;
      setWriteFreshness("offline");
    };
    const onOnline = () => {
      resyncPendingRef.current = true;
      setWriteFreshness("resyncing");
      restoreAfterUndroppedResume();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [session, setWriteFreshness]);

  // A freshly loaded client that stays visible/online is eligible. This also
  // covers venues that never transitioned through an explicit resume epoch.
  // Eligibility is additionally gated on authentication: only authenticated
  // controllers may ever become write-eligible, so unauthenticated displays
  // never appear capable of mutating shared state (and MatchLifecycle never
  // attempts conditional transitions for them).
  const writeEligible =
    isAuthenticated &&
    origin.authenticated &&
    Boolean(uid) &&
    origin.location === listenPrefix &&
    origin.uid === uid &&
    writeFreshness === "ready";

  // Track real Firebase connectivity (`.info/connected`), the authoritative
  // signal for whether the current subscription epoch is still live. A drop
  // while suspended (hidden/offline) is recorded so a resume cannot restore
  // eligibility before a post-reconnect snapshot arrives; a drop while
  // eligible immediately makes the client ineligible until a core
  // subscription delivers again.
  useEffect(() => {
    const connectedRef = ref(database, ".info/connected");
    const unsubConnected = onValue(connectedRef, (snapshot) => {
      const connected = snapshot.val() === true;
      firebaseConnectedRef.current = connected;
      if (connected) return;
      suspendedDropRef.current = true;
      if (!document.hidden && session.getSnapshot().freshness === "ready") {
        resyncPendingRef.current = true;
        setWriteFreshness("resyncing");
      }
    });

    return () => {
      unsubConnected();
    };
  }, [session, setWriteFreshness]);

  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingQueueCreations] = useState(() => new PendingQueueCreations());
  const dismissMutationError = useCallback(() => setMutationError(null), []);
  const reportMutationError = useCallback((error: unknown) => {
    console.error("Shared-state command failed:", error);
    setMutationError(
      error instanceof Error ? error.message : "Ekki tókst að vista breytingu.",
    );
  }, []);

  // The only ordinary shared-state submission boundary. The origin is bound
  // to this render, so a retained handler never acquires a newer epoch. Check
  // before reading refs and again immediately before calling the SDK writer.
  const executeCommand = useCallback(
    (
      stateArea: AuditStateArea,
      action: string,
      prepare: () => Record<string, unknown>,
      queueDependencies: () => QueueDependencies = () => [],
    ): Promise<void> => {
      let submission: Promise<void>;
      try {
        submission = pendingQueueCreations.run(
          session,
          origin,
          queueDependencies,
          (waited) => {
            const ids = queueDependencies();
            if (
              waited &&
              ids !== "all" &&
              ids.some((id) => !controllerRef.current.queues[id])
            ) {
              throw new Error("Biðröð er ekki lengur til. Reyndu aftur.");
            }
            return prepare();
          },
          (diff) => {
            const audit = session.audit(origin, stateArea, action);
            return Object.keys(diff).length > 0
              ? firebaseDatabase.writeAudited(
                  origin.location,
                  stateArea,
                  diff,
                  audit,
                )
              : Promise.resolve();
          },
        );
      } catch (error) {
        submission = Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
      // Legacy button actions can ignore the promise safely. Awaiting editors
      // still receive the original rejection and retain their local drafts.
      void submission.catch(reportMutationError);
      return submission;
    },
    [session, origin, reportMutationError, pendingQueueCreations],
  );

  useEffect(() => {
    const locationsRef = ref(database, "locations");
    const unsubLocations = onValue(locationsRef, (snapshot) => {
      const parsed = parseLocations(snapshot.val());
      setListeners(parsed ?? defaultListeners);
    });

    return () => {
      unsubLocations();
    };
  }, []);

  useEffect(() => {
    const offsetRef = ref(database, ".info/serverTimeOffset");
    const unsubOffset = onValue(offsetRef, (snapshot) => {
      const offset = snapshot.val() as unknown as number;
      serverTimeOffsetRef.current = offset ?? 0;
    });

    return () => {
      unsubOffset();
    };
  }, []);

  const scope = origin.scope;
  useEffect(() => {
    if (
      listenPrefix &&
      session.getSnapshot().location === listenPrefix &&
      session.getSnapshot().scope === scope
    ) {
      // Reset the transition baseline so a new venue's loaded view is treated
      // as an initial load, never a stale cross-venue transition.
      prevControllerViewRef.current = null;
      // A new venue is a fresh initial load: no resume epoch is pending.
      // Unchanged cached core nodes need not emit again after reconnect;
      // the remaining initial deliveries still complete the all-five gate.
      resyncPendingRef.current = false;

      let active = true;
      const subscriptionScope = session.getSnapshot();
      const isActive = () => {
        const current = session.getSnapshot();
        return active && current.scope === subscriptionScope.scope;
      };

      let matchReady = false;
      let controllerReady = false;
      let viewReady = false;
      let clubOverridesReady = false;
      let perimeterReady = false;

      const checkReady = () => {
        if (!isActive()) return;
        if (
          matchReady &&
          controllerReady &&
          viewReady &&
          clubOverridesReady &&
          perimeterReady
        ) {
          setReady(true);
          readyScopeRef.current = subscriptionScope.scope;
          // Readiness and resynchronization can finish in either order. An
          // undropped resume also needs no extra core update once the last
          // required initial snapshot arrives, even if it is non-core.
          if (
            (!resyncPendingRef.current ||
              (!suspendedDropRef.current &&
                session.getSnapshot().freshness === "resyncing")) &&
            !document.hidden &&
            firebaseConnectedRef.current
          ) {
            resyncPendingRef.current = false;
            suspendedDropRef.current = false;
            setWriteFreshness("ready");
          }
        }
      };

      const matchPath = `states/${listenPrefix}/match`;
      const controllerPath = `states/${listenPrefix}/controller`;
      const viewPath = `states/${listenPrefix}/view`;
      const clubOverridesPath = `states/${listenPrefix}/clubOverrides`;
      const perimeterPath = `states/${listenPrefix}/perimeter`;

      const unsubMatch = onValue(
        ref(database, matchPath),
        (snapshot) => {
          if (!isActive()) return;
          const results = parseMatch(snapshot.val(), defaultMatch);
          matchRef.current = results ?? defaultMatch;
          setMatch(matchRef.current);
          markSubscriptionDelivered();
          if (!matchReady) {
            matchReady = true;
            checkReady();
          }
        },
        (error) => console.error("Firebase match subscription error:", error),
      );

      const unsubController = onValue(
        ref(database, controllerPath),
        (snapshot) => {
          if (!isActive()) return;
          const results = parseController(snapshot.val(), defaultController);
          controllerRef.current = results ?? defaultController;
          setController(controllerRef.current);
          markSubscriptionDelivered();
          if (!controllerReady) {
            controllerReady = true;
            checkReady();
          }
        },
        (error) =>
          console.error("Firebase controller subscription error:", error),
      );

      const unsubView = onValue(
        ref(database, viewPath),
        (snapshot) => {
          if (!isActive()) return;
          const results = parseView(snapshot.val(), defaultView);
          viewRef.current = results ?? defaultView;
          setView(viewRef.current);
          markSubscriptionDelivered();
          if (!viewReady) {
            viewReady = true;
            checkReady();
          }
        },
        (error) => console.error("Firebase view subscription error:", error),
      );

      const unsubClubOverrides = onValue(
        ref(database, clubOverridesPath),
        (snapshot) => {
          if (!isActive()) return;
          const results = parseClubOverrides(snapshot.val());
          clubOverridesRef.current = results ?? defaultClubOverrides;
          setClubOverrides(clubOverridesRef.current);
          if (!clubOverridesReady) {
            clubOverridesReady = true;
            checkReady();
          }
        },
        (error) =>
          console.error("Firebase clubOverrides subscription error:", error),
      );

      const unsubPerimeter = onValue(
        ref(database, perimeterPath),
        (snapshot) => {
          if (!isActive()) return;
          const raw: unknown = snapshot.val();
          setPerimeter(parsePerimeterState(raw) ?? defaultPerimeter);
          const overlay =
            raw && typeof raw === "object"
              ? parsePerimeterOverlay(
                  (raw as Record<string, unknown>).overlay ?? null,
                  { location: listenPrefix, bucket: FIREBASE_STORAGE_BUCKET },
                )
              : null;
          setOverlay(overlay);
          // The operator-configured home-goal overlay media rides along on
          // the same desired-state subscription (absent config is null and
          // the goal button falls back to the legacy pair).
          setPerimeterGoalVideoState(
            parsePerimeterGoalVideo(
              raw && typeof raw === "object"
                ? ((raw as Record<string, unknown>).goalVideo ?? null)
                : null,
              { location: listenPrefix, bucket: FIREBASE_STORAGE_BUCKET },
            ),
          );
          if (!perimeterReady) {
            perimeterReady = true;
            checkReady();
          }
        },
        (error) =>
          console.error("Firebase perimeter subscription error:", error),
      );

      const adLayoutPath = `states/${listenPrefix}/perimeter/adLayout`;
      const unsubAdLayout = onValue(
        ref(database, adLayoutPath),
        (snapshot) => {
          if (!isActive()) return;
          const raw: unknown = snapshot.val();
          setPerimeterAdLayoutState(
            parsePerimeterAdLayout(raw, {
              location: listenPrefix,
              bucket: FIREBASE_STORAGE_BUCKET,
            }),
          );
        },
        (error) =>
          console.error(
            "Firebase perimeter adLayout subscription error:",
            error,
          ),
      );

      // Named perimeter media pairs: an operator-curated library of overlay
      // pairs stored under states/{listenPrefix}/perimeter/mediaPairs.
      const mediaPairsPath = `states/${listenPrefix}/perimeter/mediaPairs`;
      const unsubMediaPairs = onValue(
        ref(database, mediaPairsPath),
        (snapshot) => {
          if (!isActive()) return;
          setMediaPairs(
            parsePerimeterMediaPairs(snapshot.val(), {
              location: listenPrefix,
              bucket: FIREBASE_STORAGE_BUCKET,
            }),
          );
        },
        (error) =>
          console.error(
            "Firebase perimeter mediaPairs subscription error:",
            error,
          ),
      );

      // Perimeter brightness (Vnnox): the controller's requested integer
      // percentage under states/{location}/perimeter/brightness and the
      // daemon-published status under perimeter/{location}/brightnessStatus.
      // The status is daemon-owned and deliberately NOT part of readiness.
      const brightnessPath = `states/${listenPrefix}/perimeter/brightness`;
      const unsubBrightness = onValue(
        ref(database, brightnessPath),
        (snapshot) => {
          if (!isActive()) return;
          setPerimeterBrightnessState(parsePerimeterBrightness(snapshot.val()));
        },
        (error) =>
          console.error(
            "Firebase perimeter brightness subscription error:",
            error,
          ),
      );

      const brightnessStatusPath = `perimeter/${listenPrefix}/brightnessStatus`;
      const unsubBrightnessStatus = isAuthenticated
        ? onValue(
            ref(database, brightnessStatusPath),
            (snapshot) => {
              if (!isActive()) return;
              setPerimeterBrightnessStatus(
                parsePerimeterBrightnessStatus(snapshot.val()),
              );
            },
            (error) =>
              console.error(
                "Firebase perimeter brightnessStatus subscription error:",
                error,
              ),
          )
        : () => undefined;

      // Automatic-brightness desired config written by the controller and
      // read by the perimeter-control daemon. Absent node = auto disabled.
      const brightnessAutoPath = `states/${listenPrefix}/perimeter/brightnessAuto`;
      const unsubBrightnessAuto = onValue(
        ref(database, brightnessAutoPath),
        (snapshot) => {
          if (!isActive()) return;
          setPerimeterBrightnessAutoState(
            parsePerimeterBrightnessAuto(snapshot.val()),
          );
        },
        (error) =>
          console.error(
            "Firebase perimeter brightnessAuto subscription error:",
            error,
          ),
      );

      return () => {
        active = false;
        unsubMatch();
        unsubController();
        unsubView();
        unsubClubOverrides();
        unsubPerimeter();
        unsubAdLayout();
        unsubMediaPairs();
        unsubBrightness();
        unsubBrightnessStatus();
        unsubBrightnessAuto();
      };
    }
  }, [
    isAuthenticated,
    listenPrefix,
    markSubscriptionDelivered,
    setWriteFreshness,
    session,
    scope,
  ]);

  const applyMatchUpdate = useCallback(
    (getNewState: (prev: Match) => Match, action: string) =>
      executeCommand("match", action, () => {
        const prev = matchRef.current;
        const next = getNewState(prev);
        const diff: Record<string, unknown> = {};
        for (const key of Object.keys(next) as (keyof Match)[]) {
          if (prev[key] !== next[key]) diff[key] = next[key];
        }
        return diff;
      }),
    [executeCommand],
  );

  const applyControllerUpdate = useCallback(
    (
      getNewState: (prev: ControllerState) => ControllerState,
      action: string,
      dependencies: () => QueueDependencies = () => [],
    ) =>
      executeCommand(
        "controller",
        action,
        () => {
          const prev = controllerRef.current;
          return computeControllerDiff(prev, getNewState(prev));
        },
        dependencies,
      ),
    [executeCommand],
  );

  const applyViewUpdate = useCallback(
    (getNewState: (prev: ViewState) => ViewState, action: string) =>
      executeCommand("view", action, () => {
        const prev = viewRef.current;
        const next = getNewState(prev);
        const diff: Record<string, unknown> = {};
        for (const key of Object.keys(next) as (keyof ViewState)[]) {
          if (prev[key] !== next[key]) diff[key] = next[key] ?? null;
        }
        for (const key of Object.keys(prev) as (keyof ViewState)[]) {
          if (!(key in next) && prev[key] !== undefined) diff[key] = null;
        }
        return diff;
      }),
    [executeCommand],
  );

  const updateMatch = useCallback(
    (updates: Partial<Match>) =>
      executeCommand("match", "match.update", () => {
        const prev = matchRef.current;
        const newState: Match = { ...prev, ...updates };
        const clubIdsMap = clubIds as Record<string, string>;
        const normalizeTeamName = (name: string): string => {
          const override = findClubOverrideByName(
            clubOverridesRef.current,
            name,
          );
          if (override) return override.name;
          if (clubIdsMap[name]) return name;
          const stripped = normalizeClubKey(name);
          if (clubIdsMap[stripped]) return stripped;
          return name;
        };
        const lookupClubId = (name: string): string =>
          findClubOverrideByName(clubOverridesRef.current, name)?.clubId ??
          clubIdsMap[name] ??
          clubIdsMap[normalizeClubKey(name)] ??
          "0";
        if (newState.homeTeam) {
          newState.homeTeam = normalizeTeamName(newState.homeTeam);
        }
        if (newState.awayTeam) {
          newState.awayTeam = normalizeTeamName(newState.awayTeam);
        }
        newState.homeTeamId = newState.homeTeam
          ? parseInt(lookupClubId(newState.homeTeam), 10)
          : 0;
        newState.awayTeamId = newState.awayTeam
          ? parseInt(lookupClubId(newState.awayTeam), 10)
          : 0;

        if (Number.isNaN(newState.injuryTime)) {
          newState.injuryTime = 0;
        }

        if (!Object.values(Sports).includes(newState.matchType)) {
          newState.matchType = Sports.Football;
        }

        if (newState.matchType !== prev.matchType) {
          newState.halfStops = DEFAULT_HALFSTOPS[newState.matchType];
        }

        if (newState.started && !prev.started) {
          newState.buzzer = false;
        }

        const partialData: Record<string, unknown> = {};
        for (const key of Object.keys(updates) as (keyof Match)[]) {
          partialData[key] = newState[key];
        }

        if ("homeTeam" in updates) {
          partialData.homeTeamId = newState.homeTeamId;
        }
        if ("awayTeam" in updates) {
          partialData.awayTeamId = newState.awayTeamId;
        }
        if (
          ("homeTeam" in updates || "awayTeam" in updates) &&
          !("ksiMatchId" in updates)
        ) {
          partialData.ksiMatchId = null;
        }
        if ("ksiMatchId" in updates) {
          partialData.ksiMatchId = newState.ksiMatchId ?? null;
        }
        if ("matchType" in updates && newState.matchType !== prev.matchType) {
          partialData.halfStops = newState.halfStops;
        }
        if ("injuryTime" in updates && Number.isNaN(updates.injuryTime)) {
          partialData.injuryTime = 0;
        }
        if ("started" in updates && newState.started && !prev.started) {
          partialData.buzzer = false;
        }

        return partialData;
      }),
    [executeCommand],
  );

  const getServerTime = useCallback(
    () => Date.now() + serverTimeOffsetRef.current,
    [],
  );

  // ---- Conditional automatic transitions (compare-and-set) ----------------
  //
  // Automatic lifecycle progression is performed ONLY through these actions.
  // Each one:
  //  1. requires a write-eligible (fresh) client,
  //  2. re-validates its precondition against CURRENT authoritative state via
  //     a Firebase transaction (so a stale or duplicate attempt is rejected
  //     atomically), and
  //  3. writes exactly one audit event for a committed transition.
  //
  // The transaction itself mutates the state subtree atomically; the audit
  // record is appended immediately after commit. A concurrent controller that
  // observed the same due transition fails its precondition on the next
  // transaction retry and produces no second audit.
  const applyMatchConditionalTransition = useCallback(
    async (
      precondition: (prev: Match) => boolean,
      getNewState: (prev: Match) => Match,
      action: string,
    ): Promise<boolean> => {
      if (!session.isCurrent(origin)) return false;
      let audit: AuditEventPayload;
      let committed = false;
      let committedDiff: Record<string, unknown> = {};
      try {
        audit = session.audit(origin, "match", action);
        const dbRef = ref(database, `states/${origin.location}/match`);
        // Firebase may re-invoke the update function on concurrent writes.
        // Only the final invocation's outcome decides whether the transaction
        // committed, so trust result.committed rather than a flag set inside a
        // possibly-aborted retry, and reset the candidate diff each invocation
        // so an aborted final attempt never audits a stale diff.
        const result = await runTransaction(dbRef, (currentData) => {
          committedDiff = {};
          if (!session.isCurrent(origin)) return;
          const prev = parseMatch(currentData as unknown, matchRef.current);
          if (!prev) {
            return; // abort: no authoritative state to compare against
          }
          if (!precondition(prev)) {
            return; // abort: obsolete or duplicate attempt
          }
          const newState = getNewState(prev);
          const diff: Record<string, unknown> = {};
          for (const key of Object.keys(newState) as (keyof Match)[]) {
            if (prev[key] !== newState[key]) {
              diff[key] = newState[key];
            }
          }
          if (Object.keys(diff).length === 0) {
            return; // nothing to apply
          }
          committedDiff = diff;
          return applyStateDiff(currentData, diff);
        });
        committed = result.committed;
      } catch (error) {
        console.error("Conditional match transition failed:", error);
        return false;
      }

      if (committed && Object.keys(committedDiff).length > 0) {
        firebaseDatabase
          .writeAuditOnly(origin.location, "match", committedDiff, audit)
          .catch((error) =>
            console.error("Failed to record audit for transition:", error),
          );
      }
      return committed;
    },
    [session, origin],
  );

  const applyControllerConditionalTransition = useCallback(
    async (
      precondition: (prev: ControllerState, rawData: unknown) => boolean,
      getNewState: (prev: ControllerState) => ControllerState,
      action: string,
    ): Promise<boolean> => {
      if (!session.isCurrent(origin)) return false;
      let audit: AuditEventPayload;
      let committed = false;
      let committedDiff: Record<string, unknown> = {};
      try {
        audit = session.audit(origin, "controller", action);
        const dbRef = ref(database, `states/${origin.location}/controller`);
        // See applyMatchConditionalTransition: trust result.committed and
        // reset the candidate diff on each retry so an aborted final attempt
        // neither reports success nor emits an audit.
        const result = await runTransaction(dbRef, (currentData) => {
          committedDiff = {};
          if (!session.isCurrent(origin)) return;
          const prev = parseController(
            currentData as unknown,
            controllerRef.current,
          );
          if (!prev) {
            return; // abort: no authoritative state to compare against
          }
          if (!precondition(prev, currentData)) {
            return; // abort: obsolete or duplicate attempt
          }
          const newState = getNewState(prev);
          const diff = computeControllerDiff(prev, newState);
          if (Object.keys(diff).length === 0) {
            return;
          }
          committedDiff = diff;
          return applyStateDiff(currentData, diff);
        });
        committed = result.committed;
      } catch (error) {
        console.error("Conditional controller transition failed:", error);
        return false;
      }

      if (committed && Object.keys(committedDiff).length > 0) {
        firebaseDatabase
          .writeAuditOnly(origin.location, "controller", committedDiff, audit)
          .catch((error) =>
            console.error("Failed to record audit for transition:", error),
          );
      }
      return committed;
    },
    [session, origin],
  );

  const startMatch = useCallback(() => {
    const observed = matchRef.current;
    if (observed.started !== 0) return;
    void applyMatchConditionalTransition(
      (prev) => prev.started === observed.started,
      (prev) => ({
        ...prev,
        started: getServerTime(),
        countdown: false,
        halftimeCountdown: false,
      }),
      "match.start",
    );
  }, [applyMatchConditionalTransition, getServerTime]);

  const pauseMatch = useCallback(
    (isHalfEnd?: boolean) => {
      const observed = matchRef.current;
      void applyMatchConditionalTransition(
        (prev) =>
          prev.started === observed.started &&
          prev.countdown === observed.countdown &&
          prev.halftimeCountdown === observed.halftimeCountdown,
        (prev) => {
          const newState: Match = { ...prev, started: 0 };
          if (prev.halftimeCountdown) {
            // Cancelling or completing halftime countdown — advance to next half
            newState.countdown = false;
            newState.halftimeCountdown = false;
            newState.timeElapsed = (newState.halfStops[0] ?? 0) * 60 * 1000;
            if (newState.halfStops.length > 1) {
              newState.halfStops = newState.halfStops.slice(1);
            }
          } else if (isHalfEnd) {
            newState.timeElapsed = (newState.halfStops[0] ?? 0) * 60 * 1000;
            if (newState.halfStops.length > 1) {
              newState.halfStops = newState.halfStops.slice(1);
            }
          } else if (prev.started && !prev.countdown) {
            newState.timeElapsed =
              prev.timeElapsed + Math.floor(getServerTime() - prev.started);
          }
          return newState;
        },
        "match.pause",
      );
    },
    [applyMatchConditionalTransition, getServerTime],
  );

  const resetMatch = useCallback(() => {
    void applyMatchUpdate(
      (prev) => ({
        ...prev,
        started: 0,
        timeElapsed: 0,
        home2min: [],
        away2min: [],
        timeout: 0,
        homeTimeouts: 0,
        awayTimeouts: 0,
        buzzer: false,
        countdown: false,
        halftimeCountdown: false,
        halfStops: DEFAULT_HALFSTOPS[prev.matchType],
      }),
      "match.reset",
    );
  }, [applyMatchUpdate]);

  const addGoal = useCallback(
    (team: "home" | "away") => {
      void applyMatchUpdate((prev) => {
        const scoreKeys = { home: "homeScore", away: "awayScore" } as const;
        const key = scoreKeys[team];
        return { ...prev, [key]: prev[key] + 1 };
      }, "match.add-goal");
    },
    [applyMatchUpdate],
  );

  const addPenalty = useCallback(
    (team: "home" | "away", key: string, penaltyLength: number) => {
      void applyMatchUpdate((prev) => {
        const penaltyKeys = { home: "home2min", away: "away2min" } as const;
        const stateKey = penaltyKeys[team];
        const collection = [...prev[stateKey]];
        collection.push({
          atTimeElapsed: prev.timeElapsed,
          key,
          penaltyLength,
        });
        return { ...prev, [stateKey]: collection };
      }, "match.add-penalty");
    },
    [applyMatchUpdate],
  );

  const removePenalty = useCallback(
    (key: string) => {
      void applyMatchUpdate((prev) => {
        const homeHasKey = prev.home2min.some((t) => t.key === key);
        const awayHasKey = prev.away2min.some((t) => t.key === key);
        return {
          ...prev,
          ...(homeHasKey && {
            home2min: prev.home2min.filter((t) => t.key !== key),
          }),
          ...(awayHasKey && {
            away2min: prev.away2min.filter((t) => t.key !== key),
          }),
        };
      }, "match.remove-penalty");
    },
    [applyMatchUpdate],
  );

  const addToPenalty = useCallback(
    (key: string, toAdd: number) => {
      void applyMatchUpdate((prev) => {
        const homeHasKey = prev.home2min.some((t) => t.key === key);
        const awayHasKey = prev.away2min.some((t) => t.key === key);
        const mapFn = (t: TwoMinPenalty) =>
          t.key === key
            ? { ...t, penaltyLength: Number(t.penaltyLength) + Number(toAdd) }
            : t;
        return {
          ...prev,
          ...(homeHasKey && { home2min: prev.home2min.map(mapFn) }),
          ...(awayHasKey && { away2min: prev.away2min.map(mapFn) }),
        };
      }, "match.add-to-penalty");
    },
    [applyMatchUpdate],
  );

  const updateHalfLength = useCallback(
    (currentValue: number, newValue: string) => {
      void applyMatchUpdate((prev) => {
        const newValueParsed = newValue === "" ? 0 : parseInt(newValue, 10);
        if (Number.isNaN(newValueParsed) || newValueParsed < 0) {
          return prev;
        }
        return {
          ...prev,
          halfStops: prev.halfStops.map((v) =>
            v === currentValue ? newValueParsed : v,
          ),
        };
      }, "match.update-half-length");
    },
    [applyMatchUpdate],
  );

  // Intentional match-time correction (Tímastjórnun). Backward corrections are
  // audited distinctly so operators can distinguish an intentional correction
  // from an ordinary match update or an accidental stale mutation.
  const adjustMatchTime = useCallback(
    (deltaMs: number) => {
      const action =
        deltaMs < 0
          ? "match.correct-time-backward"
          : "match.correct-time-forward";
      void applyMatchUpdate((prev) => {
        const base = roundMillisToSeconds(prev.timeElapsed);
        const next = Math.max(base + deltaMs, 0);
        return { ...prev, timeElapsed: next };
      }, action);
    },
    [applyMatchUpdate],
  );

  const setHalfStops = useCallback(
    (halfStops: number[], mode: InjuryTimeDisplayMode) => {
      void applyMatchUpdate(
        (prev) => ({
          ...prev,
          halfStops,
          injuryTimeDisplayMode: mode,
        }),
        "match.set-half-stops",
      );
    },
    [applyMatchUpdate],
  );

  const matchTimeout = useCallback(
    (team: "home" | "away") => {
      void applyMatchUpdate((prev) => {
        const timeoutKeys = {
          home: "homeTimeouts",
          away: "awayTimeouts",
        } as const;
        const stateKey = timeoutKeys[team];
        return {
          ...prev,
          timeout: getServerTime(),
          [stateKey]: Math.min(prev[stateKey] + 1, 4),
        };
      }, "match.timeout");
    },
    [applyMatchUpdate, getServerTime],
  );

  const removeTimeout = useCallback(() => {
    void applyMatchUpdate(
      (prev) => ({ ...prev, timeout: 0 }),
      "match.remove-timeout",
    );
  }, [applyMatchUpdate]);

  const buzz = useCallback(
    (on: boolean) => {
      void applyMatchUpdate(
        (prev) => ({
          ...prev,
          buzzer: on ? getServerTime() : false,
        }),
        "match.buzz",
      );
    },
    [applyMatchUpdate, getServerTime],
  );

  const countdown = useCallback(() => {
    void applyMatchUpdate((prev) => {
      if (
        !prev.matchStartTime ||
        typeof prev.matchStartTime !== "string" ||
        !/^\d{1,2}:\d{2}$/.test(prev.matchStartTime)
      ) {
        console.warn(
          "countdown() called without valid matchStartTime, ignoring",
        );
        return prev;
      }
      const duration = msUntilMatchStart(prev.matchStartTime);
      if (duration === null) {
        console.warn("countdown() invalid moment from matchStartTime");
        return prev;
      }
      return {
        ...prev,
        started: getServerTime() + duration,
        countdown: true,
      };
    }, "match.countdown");
  }, [applyMatchUpdate, getServerTime]);

  const startHalftimeCountdown = useCallback(() => {
    void applyMatchUpdate((prev) => {
      if (!isHalftimeTransitionEligible(prev)) return prev;
      return {
        ...prev,
        timeElapsed: 0,
        started: getServerTime() + HALFTIME_DURATION_MS,
        countdown: true,
        halftimeCountdown: true,
      };
    }, "match.start-halftime-countdown");
  }, [applyMatchUpdate, getServerTime]);

  const stopHalftimeCountdown = useCallback(() => {
    void applyMatchUpdate((prev) => {
      const newState: Match = {
        ...prev,
        started: 0,
        countdown: false,
        halftimeCountdown: false,
      };
      newState.timeElapsed = (newState.halfStops[0] ?? 0) * 60 * 1000;
      if (newState.halfStops.length > 1) {
        newState.halfStops = newState.halfStops.slice(1);
      }
      return newState;
    }, "match.stop-halftime-countdown");
  }, [applyMatchUpdate]);

  // Countdown completion (pre-match or halftime), conditional on the exact
  // observed countdown generation still being authoritative.
  const completeCountdownIfCurrent = useCallback(
    (observed: CountdownCompletionObservation): Promise<boolean> =>
      applyMatchConditionalTransition(
        countdownCompletionPrecondition(observed),
        countdownCompletionTransition({
          halftimeCountdown: observed.halftimeCountdown,
        }),
        "match.complete-countdown",
      ),
    [applyMatchConditionalTransition],
  );

  // Half-stop (injury-time "stop" mode) at a period boundary, conditional on
  // the exact running generation still being authoritative.
  const applyHalfStopIfCurrent = useCallback(
    (observed: HalfStopObservation): Promise<boolean> =>
      applyMatchConditionalTransition(
        halfStopPrecondition(observed),
        halfStopTransition({
          halfStopBoundaryMinutes: observed.halfStopBoundaryMinutes,
        }),
        "match.half-stop",
      ),
    [applyMatchConditionalTransition],
  );

  // Timeout expiry, conditional on the exact timeout still being active.
  const removeTimeoutIfCurrent = useCallback(
    (observed: TimeoutExpiryObservation): Promise<boolean> =>
      applyMatchConditionalTransition(
        timeoutExpiryPrecondition(observed),
        timeoutExpiryTransition(),
        "match.remove-timeout",
      ),
    [applyMatchConditionalTransition],
  );

  // Penalty expiry, conditional on the exact penalty record still existing.
  const removePenaltyIfCurrent = useCallback(
    (observed: PenaltyExpiryObservation): Promise<boolean> =>
      applyMatchConditionalTransition(
        penaltyExpiryPrecondition(observed),
        penaltyExpiryTransition({ key: observed.key }),
        "match.remove-penalty",
      ),
    [applyMatchConditionalTransition],
  );

  // Timed asset completion, conditional on the exact current asset and queue
  // still being authoritative. Legacy observations match only an absent raw
  // occurrence field; every advancing successor receives a fresh ID.
  const completeAssetIfCurrent = useCallback(
    (observed: TimedAssetCompletionObservation): Promise<boolean> => {
      const successorOccurrenceId = crypto.randomUUID();
      return applyControllerConditionalTransition(
        timedAssetCompletionPrecondition(observed),
        (prev) => {
          const activeQueue = prev.activeQueueId
            ? prev.queues[prev.activeQueueId]
            : null;
          if (!activeQueue) {
            return { ...prev, playing: false, currentAsset: null };
          }
          if (activeQueue.autoPlay) {
            if (prev.playing) {
              return getStateShowingNextAsset(prev, successorOccurrenceId);
            }
            return prev;
          }
          return { ...prev, currentAsset: null };
        },
        "controller.complete-asset",
      );
    },
    [applyControllerConditionalTransition],
  );

  const updateRedCards = useCallback(
    (home: number, away: number) => {
      void applyMatchUpdate(
        (prev) => ({
          ...prev,
          homeRedCards: home,
          awayRedCards: away,
        }),
        "match.update-red-cards",
      );
    },
    [applyMatchUpdate],
  );

  const updateController = useCallback(
    (updates: ControllerUpdates) => {
      void applyControllerUpdate(
        (prev) => {
          if (updates.currentAsset != null)
            throw new Error("Use renderAsset to select playback.");
          return { ...prev, ...updates };
        },
        "controller.update",
        () => [
          ...Object.keys(updates.queues ?? {}),
          ...(updates.activeQueueId ? [updates.activeQueueId] : []),
        ],
      );
    },
    [applyControllerUpdate],
  );

  const selectView = useCallback(
    (view: string) => {
      void applyControllerUpdate(
        (prev) => ({ ...prev, view }),
        "controller.select-view",
      );
    },
    [applyControllerUpdate],
  );

  const selectAssetView = useCallback(
    (assetView: string) => {
      void applyControllerUpdate(
        (prev) => ({ ...prev, assetView }),
        "controller.select-asset-view",
      );
    },
    [applyControllerUpdate],
  );

  // The callback keeps the render's origin across callers' media preparation.
  // IDs are usable only after the complete audited submission succeeds.
  const submitQueue = useCallback(
    (
      name: string,
      items: Asset[],
      options: QueueOptions | undefined,
      replace: boolean,
    ) => {
      const queueId = `queue-${crypto.randomUUID()}`;
      const submission = applyControllerUpdate(
        (prev) => {
          const existing = replace
            ? Object.values(prev.queues).find((queue) => queue.name === name)
            : undefined;
          const base = existing
            ? getStateWithoutQueue(prev, existing.id)
            : prev;
          return getStateWithNewQueue(base, queueId, name, items, options);
        },
        replace ? "controller.replace-queue" : "controller.create-queue",
        () =>
          replace
            ? Object.values(controllerRef.current.queues)
                .filter((queue) => queue.name === name)
                .map((queue) => queue.id)
            : [],
      );
      const result = submission.then(() => queueId);
      // executeCommand reports the rejection. Also handle this derived promise
      // for button adapters that deliberately discard their result.
      void result.catch(() => undefined);
      return result;
    },
    [applyControllerUpdate],
  );

  const createQueue = useCallback(
    (name: string, items: Asset[] = [], options?: QueueOptions) =>
      submitQueue(name, items, options, false),
    [submitQueue],
  );

  const replaceQueue = useCallback(
    (name: string, items: Asset[], options?: QueueOptions) =>
      submitQueue(name, items, options, true),
    [submitQueue],
  );

  const appendSubstitutionAndActivate = useCallback(
    ({ side, outgoing, incoming, asset }: SubstitutionIntent) =>
      executeCommand(
        "controller",
        "controller.append-substitution-and-activate",
        () => {
          const prev = controllerRef.current;
          const players = prev.roster[side];
          const findPlayer = (selected: Player) =>
            players.findIndex(
              (player) =>
                player.name === selected.name &&
                player.number === selected.number &&
                (selected.id === undefined || player.id === selected.id),
            );
          const offIdx = findPlayer(outgoing);
          const onIdx = findPlayer(incoming);
          // Another substitution can finish while these cards prepare. Match
          // the picker's eligibility against current subscription values.
          if (
            offIdx === -1 ||
            onIdx === -1 ||
            offIdx === onIdx ||
            !players[offIdx]?.show ||
            players[onIdx]?.show ||
            players[onIdx]?.number == null
          ) {
            throw new Error(
              "Leikmannahópur hefur breyst. Veldu skiptingu aftur.",
            );
          }
          if (
            asset.type !== assetTypes.SUB ||
            !asset.key ||
            !asset.subIn ||
            !asset.subOut
          ) {
            throw new Error("Ekki tókst að undirbúa skiptingu.");
          }
          const name = "Skiptingar";
          const existing = Object.values(prev.queues).find(
            (queue) => queue.name === name,
          );
          const queueId = existing?.id ?? `queue-${crypto.randomUUID()}`;
          const withItems = existing
            ? getStateWithAddedItems(prev, queueId, [asset])
            : getStateWithNewQueue(prev, queueId, name, [asset], {
                cycle: false,
              });
          return {
            ...computeControllerDiff(prev, {
              ...withItems,
              activeQueueId: queueId,
            }),
            [`roster/${side}/${playerChildKey(players, offIdx)}/show`]: false,
            [`roster/${side}/${playerChildKey(players, onIdx)}/show`]: true,
          };
        },
        () =>
          Object.values(controllerRef.current.queues)
            .filter((queue) => queue.name === "Skiptingar")
            .map((queue) => queue.id),
      ),
    [executeCommand],
  );

  const deleteQueue = useCallback(
    (queueId: string) => {
      void applyControllerUpdate(
        (prev) => getStateWithoutQueue(prev, queueId),
        "controller.delete-queue",
        () => [queueId],
      );
    },
    [applyControllerUpdate],
  );

  const renameQueue = useCallback(
    (queueId: string, name: string) => {
      void applyControllerUpdate(
        (prev) => {
          const queue = prev.queues[queueId];
          if (!queue) return prev;
          return {
            ...prev,
            queues: { ...prev.queues, [queueId]: { ...queue, name } },
          };
        },
        "controller.rename-queue",
        () => [queueId],
      );
    },
    [applyControllerUpdate],
  );

  const reorderQueues = useCallback(
    (orderedIds: string[]) => {
      void applyControllerUpdate(
        (prev) => {
          if (!orderedIds.length) return prev;
          const queues = { ...prev.queues };
          const listedIds = new Set(orderedIds);

          // Assign orders to listed queues
          orderedIds.forEach((queueId, index) => {
            const queue = queues[queueId];
            if (queue) {
              queues[queueId] = { ...queue, order: index };
            }
          });

          // Find unlisted queues and sort them by current order
          const unlistedQueues = Object.entries(queues)
            .filter(([id]) => !listedIds.has(id))
            .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));

          // Assign sequential orders to unlisted queues after listed ones
          unlistedQueues.forEach(([queueId, queue], index) => {
            queues[queueId] = { ...queue, order: orderedIds.length + index };
          });

          return { ...prev, queues };
        },
        "controller.reorder-queues",
        () => "all",
      );
    },
    [applyControllerUpdate],
  );

  const addItemsToQueue = useCallback(
    (queueId: string, assets: Asset[]) =>
      applyControllerUpdate(
        (prev) => getStateWithAddedItems(prev, queueId, assets),
        "controller.add-items-to-queue",
        () => [queueId],
      ),
    [applyControllerUpdate],
  );

  const removeItemFromQueue = useCallback(
    (queueId: string, assetKey: string) => {
      void applyControllerUpdate(
        (prev) => {
          const queue = prev.queues[queueId];
          if (!queue) return prev;
          const idx = queue.items.map((item) => item.key).indexOf(assetKey);
          if (idx === -1) return prev;
          const updatedItems = [...queue.items];
          updatedItems.splice(idx, 1);
          if (updatedItems.length === 0) {
            const nextState = {
              ...prev,
              queues: {
                ...prev.queues,
                [queueId]: { ...queue, items: updatedItems },
              },
            };
            return maybeAutoDeleteQueue(nextState, queueId);
          }
          return {
            ...prev,
            queues: {
              ...prev.queues,
              [queueId]: { ...queue, items: updatedItems },
            },
          };
        },
        "controller.remove-item-from-queue",
        () => [queueId],
      );
    },
    [applyControllerUpdate],
  );

  const reorderItemsInQueue = useCallback(
    (queueId: string, items: Asset[]) => {
      void applyControllerUpdate(
        (prev) => {
          const queue = prev.queues[queueId];
          if (!queue) return prev;
          const filteredItems = items.filter(
            (asset) =>
              Object.keys(assetTypes).indexOf(asset.type) !== -1 &&
              Boolean(asset.key),
          );
          const dedupedItems: Asset[] = [];
          const seenKeys = new Set<string>();
          filteredItems.forEach((asset) => {
            if (!seenKeys.has(asset.key)) {
              dedupedItems.push(asset);
              seenKeys.add(asset.key);
            }
          });
          if (dedupedItems.length === 0) {
            const nextState = {
              ...prev,
              queues: {
                ...prev.queues,
                [queueId]: { ...queue, items: dedupedItems },
              },
            };
            return maybeAutoDeleteQueue(nextState, queueId);
          }
          return {
            ...prev,
            queues: {
              ...prev.queues,
              [queueId]: { ...queue, items: dedupedItems },
            },
          };
        },
        "controller.reorder-items-in-queue",
        () => [queueId],
      );
    },
    [applyControllerUpdate],
  );

  const updateQueueSettings = useCallback(
    (
      queueId: string,
      settings: Partial<
        Pick<QueueState, "autoPlay" | "imageSeconds" | "cycle">
      >,
    ) => {
      void applyControllerUpdate(
        (prev) => {
          const queue = prev.queues[queueId];
          if (!queue) return prev;
          const nextState = {
            ...prev,
            queues: {
              ...prev.queues,
              [queueId]: { ...queue, ...settings },
            },
          };
          if (settings.cycle === false) {
            return maybeAutoDeleteQueue(nextState, queueId);
          }
          return nextState;
        },
        "controller.update-queue-settings",
        () => [queueId],
      );
    },
    [applyControllerUpdate],
  );

  const playQueue = useCallback(
    (queueId: string) => {
      void applyControllerUpdate(
        (prev) => {
          return getStateShowingNextAsset(
            {
              ...prev,
              activeQueueId: queueId,
            },
            crypto.randomUUID(),
          );
        },
        "controller.play-queue",
        () => [queueId],
      );
    },
    [applyControllerUpdate],
  );

  const activateQueue = useCallback(
    (queueId: string) => {
      void applyControllerUpdate(
        (prev) => ({
          ...prev,
          activeQueueId: queueId,
        }),
        "controller.activate-queue",
        () => [queueId],
      );
    },
    [applyControllerUpdate],
  );

  const stopPlaying = useCallback(() => {
    void applyControllerUpdate(
      (prev) => ({ ...prev, playing: false }),
      "controller.stop-playing",
    );
  }, [applyControllerUpdate]);

  const setPlaying = useCallback(
    (playing: boolean) => {
      void applyControllerUpdate(
        (prev) => ({ ...prev, playing }),
        "controller.set-playing",
      );
    },
    [applyControllerUpdate],
  );

  const renderAsset = useCallback(
    (asset: Asset | null) => {
      return applyControllerUpdate(
        (prev) => ({
          ...prev,
          currentAsset: asset
            ? { asset, time: null, occurrenceId: crypto.randomUUID() }
            : null,
          activeQueueId: null,
          playing: false,
        }),
        "controller.render-asset",
      );
    },
    [applyControllerUpdate],
  );

  const showItemNow = useCallback(
    (asset: Asset) => {
      void renderAsset(asset);
    },
    [renderAsset],
  );

  const showNextAsset = useCallback(() => {
    void applyControllerUpdate(
      (prev) => getStateShowingNextAsset(prev, crypto.randomUUID()),
      "controller.show-next-asset",
      () =>
        controllerRef.current.activeQueueId
          ? [controllerRef.current.activeQueueId]
          : [],
    );
  }, [applyControllerUpdate]);

  const remoteRefresh = useCallback(() => {
    void applyControllerUpdate(
      (prev) => ({
        ...prev,
        refreshToken: (Math.random() + 1).toString(36).substring(2),
      }),
      "controller.remote-refresh",
    );
  }, [applyControllerUpdate]);

  const setRoster = useCallback(
    (roster: Roster) => {
      void applyControllerUpdate(
        (prev) => ({
          ...prev,
          roster,
        }),
        "controller.set-roster",
      );
    },
    [applyControllerUpdate],
  );

  const editPlayer = useCallback(
    (side: "home" | "away", idx: number, updatedPlayer: Partial<Player>) => {
      void applyControllerUpdate((prev) => {
        const roster = structuredClone(prev.roster);
        if (!roster[side] || !roster[side][idx]) return prev;
        roster[side][idx] = {
          ...roster[side][idx],
          ...updatedPlayer,
        };
        return { ...prev, roster };
      }, "controller.edit-player");
    },
    [applyControllerUpdate],
  );

  const deletePlayer = useCallback(
    (side: "home" | "away", idx: number) => {
      void applyControllerUpdate((prev) => {
        const roster = structuredClone(prev.roster);
        if (!roster[side]) return prev;
        roster[side] = roster[side].filter((_: Player, i: number) => i !== idx);
        return { ...prev, roster };
      }, "controller.delete-player");
    },
    [applyControllerUpdate],
  );

  const addPlayer = useCallback(
    (side: "home" | "away") => {
      void applyControllerUpdate((prev) => {
        const roster = structuredClone(prev.roster);
        const players = roster[side] ?? [];
        players.push({
          name: "",
          number: "",
          show: false,
          role: "",
        });
        roster[side] = players;
        return { ...prev, roster };
      }, "controller.add-player");
    },
    [applyControllerUpdate],
  );

  const clearRoster = useCallback(() => {
    void applyControllerUpdate(
      (prev) => ({
        ...prev,
        roster: { home: [], away: [] },
      }),
      "controller.clear-roster",
    );
  }, [applyControllerUpdate]);

  const selectTab = useCallback(
    (tab: string) => {
      void applyControllerUpdate(
        (prev) => ({ ...prev, tab }),
        "controller.select-tab",
      );
    },
    [applyControllerUpdate],
  );

  const updateView = useCallback(
    (updates: Partial<ViewState>) => {
      void applyViewUpdate((prev) => ({ ...prev, ...updates }), "view.update");
    },
    [applyViewUpdate],
  );

  const setViewPort = useCallback(
    (vp: ViewPort) => {
      void applyViewUpdate((prev) => ({ ...prev, vp }), "view.set-viewport");
    },
    [applyViewUpdate],
  );

  const setBackground = useCallback(
    (background: string) => {
      void applyViewUpdate(
        (prev) => ({ ...prev, background }),
        "view.set-background",
      );
    },
    [applyViewUpdate],
  );

  const setIdleImage = useCallback(
    (idleImage: string) => {
      void applyViewUpdate(
        (prev) => ({ ...prev, idleImage }),
        "view.set-idle-image",
      );
    },
    [applyViewUpdate],
  );

  const setIdleAd = useCallback(
    (idleAd: string | null) => {
      void applyViewUpdate((prev) => ({ ...prev, idleAd }), "view.set-idle-ad");
    },
    [applyViewUpdate],
  );

  const setBlackoutStart = useCallback(
    (blackoutStart: string | undefined) => {
      void applyViewUpdate(
        (prev) => ({ ...prev, blackoutStart }),
        "view.set-blackout-start",
      );
    },
    [applyViewUpdate],
  );

  const setBlackoutEnd = useCallback(
    (blackoutEnd: string | undefined) => {
      void applyViewUpdate(
        (prev) => ({ ...prev, blackoutEnd }),
        "view.set-blackout-end",
      );
    },
    [applyViewUpdate],
  );

  const setGoalGifSettings = useCallback(
    (settings: {
      goalGif1?: string | null;
      goalGif2?: string | null;
      goalGifSameImage?: boolean;
      showGoalscorerName?: boolean;
      showGoalscorerNumber?: boolean;
    }) => {
      void applyViewUpdate(
        (prev) => ({ ...prev, ...settings }),
        "view.set-goal-gif-settings",
      );
    },
    [applyViewUpdate],
  );

  const setTheme = useCallback(
    (theme: ThemeConfig | undefined) => {
      void applyViewUpdate((prev) => ({ ...prev, theme }), "view.set-theme");
    },
    [applyViewUpdate],
  );

  const setThemePreset = useCallback(
    (preset: string | undefined) => {
      void applyViewUpdate(
        (prev) => ({ ...prev, themePreset: preset }),
        "view.set-theme-preset",
      );
    },
    [applyViewUpdate],
  );

  const saveCustomPreset = useCallback(
    (id: string, preset: CustomPreset) => {
      return applyViewUpdate((prev) => {
        const existing = prev.customPresets ?? {};
        return {
          ...prev,
          customPresets: { ...existing, [id]: preset },
        };
      }, "view.save-custom-preset");
    },
    [applyViewUpdate],
  );

  const deleteCustomPreset = useCallback(
    (id: string) => {
      void applyViewUpdate((prev) => {
        if (!prev.customPresets?.[id]) return prev;

        const updated = { ...prev.customPresets };
        delete updated[id];
        const newCustomPresets =
          Object.keys(updated).length > 0 ? updated : undefined;
        return { ...prev, customPresets: newCustomPresets };
      }, "view.delete-custom-preset");
    },
    [applyViewUpdate],
  );

  // The form owns compression and Storage upload; RTDB submission and audit
  // identity always belong to the same render-bound command executor.
  const commitClubOverride = useCallback(
    (
      id: string,
      override: ClubOverride,
      action:
        | "clubOverrides.create"
        | "clubOverrides.update"
        | "clubOverrides.save",
    ) => executeCommand("clubOverrides", action, () => ({ [id]: override })),
    [executeCommand],
  );

  const saveClubOverride = useCallback(
    async (override: Omit<ClubOverride, "logoUrl"> & { logoFile: File }) => {
      session.assertCurrent(origin);
      const id = generateClubOverrideId();
      const storagePath = `${origin.location}/club-logos/${id}`;
      await storageHelpers.uploadBytes(storagePath, override.logoFile);
      const logoUrl = await storageHelpers.getDownloadURL(storagePath);
      await commitClubOverride(
        id,
        {
          name: override.name,
          clubId: override.clubId,
          logoUrl,
          isOverride: override.isOverride,
        },
        "clubOverrides.save",
      );
    },
    [session, origin, commitClubOverride],
  );

  const deleteClubOverride = useCallback(
    async (id: string) => {
      await executeCommand("clubOverrides", "clubOverrides.delete", () => ({
        [id]: null,
      }));
      await storageHelpers.deleteObject(`${origin.location}/club-logos/${id}`);
    },
    [executeCommand, origin.location],
  );

  const setPerimeterState = useCallback(
    (state: PerimeterState["state"]): Promise<void> =>
      executeCommand("perimeter", "perimeter.set-state", () => {
        return { state };
      }),
    [executeCommand],
  );

  const skipPerimeterCue = useCallback(
    (): Promise<void> =>
      executeCommand("perimeter", "perimeter.skip-cue", () => {
        return { skipCue: crypto.randomUUID() };
      }),
    [executeCommand],
  );

  const restartPerimeterDisplays = useCallback(
    (): Promise<void> =>
      executeCommand("perimeter", "perimeter.restart-displays", () => {
        return { refreshToken: crypto.randomUUID() };
      }),
    [executeCommand],
  );

  const setPerimeterOverlay = useCallback(
    (overlay: PerimeterOverlay): Promise<void> =>
      executeCommand("perimeter", "perimeter.set-overlay", () => {
        return { overlay };
      }),
    [executeCommand],
  );

  const clearPerimeterOverlay = useCallback(
    (): Promise<void> =>
      executeCommand("perimeter", "perimeter.clear-overlay", () => {
        return { overlay: null };
      }),
    [executeCommand],
  );

  const setPerimeterAdLayout = useCallback(
    (layout: PerimeterAdLayout | null): Promise<void> =>
      executeCommand("perimeter", "perimeter.set-ad-layout", () => {
        return { adLayout: layout };
      }),
    [executeCommand],
  );

  const setPerimeterGoalVideo = useCallback(
    (config: PerimeterGoalVideoConfig | null): Promise<void> =>
      executeCommand("perimeter", "perimeter.set-goal-video", () => {
        return { goalVideo: config };
      }),
    [executeCommand],
  );

  const setPerimeterScorerCelebration = useCallback(
    (style: ScorerCelebrationStyle): Promise<void> =>
      executeCommand("perimeter", "perimeter.set-scorer-celebration", () => {
        return { scorerCelebration: style };
      }),
    [executeCommand],
  );

  const setPerimeterIdleClock = useCallback(
    (enabled: boolean): Promise<void> =>
      executeCommand("perimeter", "perimeter.set-idle-clock", () => {
        return { idleClock: enabled };
      }),
    [executeCommand],
  );

  const setPerimeterPlayerDisplayStyle = useCallback(
    (style: PlayerBandStyle): Promise<void> =>
      executeCommand("perimeter", "perimeter.set-player-display-style", () => {
        return { playerDisplayStyle: style };
      }),
    [executeCommand],
  );

  const setPerimeterSubstitutionStyle = useCallback(
    (style: SubstitutionBandStyle): Promise<void> =>
      executeCommand("perimeter", "perimeter.set-substitution-style", () => {
        return { substitutionStyle: style };
      }),
    [executeCommand],
  );

  const setPerimeterBrightness = useCallback(
    (percent: number): Promise<void> =>
      executeCommand("perimeter", "perimeter.set-brightness", () => {
        if (!Number.isInteger(percent) || percent < 0 || percent > 100)
          throw new Error("Ógildur bjartleiki (0–100).");
        return { brightness: percent };
      }),
    [executeCommand],
  );

  const setPerimeterBrightnessAuto = useCallback(
    (config: PerimeterBrightnessAutoConfig): Promise<void> =>
      executeCommand("perimeter", "perimeter.set-brightness-auto", () => {
        const validationError = validateBrightnessAutoConfig(config);
        if (validationError) throw new Error(validationError);
        return {
          brightnessAuto: {
            enabled: config.enabled,
            min: config.min,
            max: config.max,
            exponent: config.exponent,
            cloudWeight: config.cloudWeight,
            luxMin: config.luxMin,
            luxMax: config.luxMax,
            updatedAt: serverTimestamp(),
          },
        };
      }),
    [executeCommand],
  );

  const createPerimeterMediaPair = useCallback(
    (pairId: string, pair: PerimeterMediaPair): Promise<void> =>
      executeCommand("perimeter", "perimeter.create-media-pair", () => {
        return { [`mediaPairs/${pairId}`]: pair };
      }),
    [executeCommand],
  );

  const setPerimeterMediaPairMainScreenAsset = useCallback(
    (pairId: string, asset: MainScreenMediaAsset | null): Promise<void> =>
      executeCommand(
        "perimeter",
        "perimeter.set-media-pair-main-screen",
        () => {
          if (
            !Object.prototype.hasOwnProperty.call(perimeterMediaPairs, pairId)
          )
            throw new Error("Jaðarefni fannst ekki.");
          const parsed =
            asset === null ? null : parseMainScreenMediaAsset(asset);
          if (parsed === undefined)
            throw new Error("Ógilt myndefni fyrir stórskjá.");
          return { [`mediaPairs/${pairId}/mainScreenAsset`]: parsed };
        },
      ),
    [executeCommand, perimeterMediaPairs],
  );

  const deletePerimeterMediaPair = useCallback(
    (pairId: string): Promise<void> =>
      executeCommand("perimeter", "perimeter.delete-media-pair", () => {
        return { [`mediaPairs/${pairId}`]: null };
      }),
    [executeCommand],
  );

  // Auto-start/stop the perimeter LEDs on view transitions: entering the match
  // view turns the perimeter on, leaving any view for idle turns it off. Only
  // writes when the perimeter is enabled, and only after initial subscriptions
  // have loaded so a reload/reconnect never replays a stale perimeter command.
  useEffect(() => {
    if (!ready || !writeEligible) return;

    const nextView = controller.view;
    const prevView = prevControllerViewRef.current;
    prevControllerViewRef.current = nextView;

    if (prevView === null || prevView === nextView) return;
    if (!perimeter.enabled) return;

    if (prevView === VIEWS.idle && nextView === VIEWS.match) {
      void setPerimeterState("on");
    } else if (nextView === VIEWS.idle) {
      void setPerimeterState("off");
    }
  }, [
    ready,
    writeEligible,
    controller.view,
    perimeter.enabled,
    setPerimeterState,
  ]);

  // Resolve viewport from live Firebase locations data by screenKey.
  // When admin changes screen dimensions, listeners updates and this recomputes.
  // Filter by listenPrefix (location key) since multiple locations can have
  // screens with the same key (e.g. "outside" at different venues).
  const effectiveView = useMemo<ViewState>(() => {
    if (!screenKey) return view;
    const found = listeners.screens.find(
      (s) => s.screen.key === screenKey && s.key === listenPrefix,
    );
    if (!found) return view;
    return { ...view, vp: found.screen };
  }, [view, screenKey, listeners.screens, listenPrefix]);

  const value = useMemo(
    () => ({
      match,
      controller,
      view: effectiveView,
      listeners,
      clubOverrides,
      perimeter,
      ready,
      updateMatch,
      startMatch,
      pauseMatch,
      resetMatch,
      addGoal,
      addPenalty,
      removePenalty,
      addToPenalty,
      updateHalfLength,
      adjustMatchTime,
      setHalfStops,
      matchTimeout,
      removeTimeout,
      buzz,
      countdown,
      startHalftimeCountdown,
      stopHalftimeCountdown,
      completeCountdownIfCurrent,
      applyHalfStopIfCurrent,
      removeTimeoutIfCurrent,
      removePenaltyIfCurrent,
      completeAssetIfCurrent,
      writeEligible,
      writeFreshness,
      updateRedCards,
      getServerTime,
      updateController,
      selectView,
      selectAssetView,
      createQueue,
      replaceQueue,
      appendSubstitutionAndActivate,
      deleteQueue,
      renameQueue,
      reorderQueues,
      addItemsToQueue,
      removeItemFromQueue,
      reorderItemsInQueue,
      updateQueueSettings,
      playQueue,
      activateQueue,
      stopPlaying,
      showItemNow,
      setPlaying,
      renderAsset,
      showNextAsset,
      remoteRefresh,
      setRoster,
      editPlayer,
      deletePlayer,
      addPlayer,
      clearRoster,
      selectTab,
      updateView,
      setViewPort,
      setBackground,
      setIdleImage,
      setIdleAd,
      setBlackoutStart,
      setBlackoutEnd,
      setGoalGifSettings,
      setTheme,
      setThemePreset,
      saveCustomPreset,
      deleteCustomPreset,
      saveClubOverride,
      commitClubOverride,
      mutationError,
      dismissMutationError,
      deleteClubOverride,
      setPerimeterState,
      skipPerimeterCue,
      restartPerimeterDisplays,
      setPerimeterOverlay,
      clearPerimeterOverlay,
      perimeterOverlay,
      setPerimeterAdLayout,
      createPerimeterMediaPair,
      setPerimeterMediaPairMainScreenAsset,
      deletePerimeterMediaPair,
      setPerimeterGoalVideo,
      setPerimeterScorerCelebration,
      setPerimeterIdleClock,
      setPerimeterPlayerDisplayStyle,
      setPerimeterSubstitutionStyle,
      perimeterGoalVideo,
      mediaPairs: perimeterMediaPairs,
      perimeterAdLayout,
      perimeterBrightness,
      perimeterBrightnessStatus,
      setPerimeterBrightness,
      perimeterBrightnessAuto,
      setPerimeterBrightnessAuto,
    }),
    [
      match,
      controller,
      effectiveView,
      listeners,
      clubOverrides,
      perimeter,
      ready,
      updateMatch,
      startMatch,
      pauseMatch,
      resetMatch,
      addGoal,
      addPenalty,
      removePenalty,
      addToPenalty,
      updateHalfLength,
      adjustMatchTime,
      setHalfStops,
      matchTimeout,
      removeTimeout,
      buzz,
      countdown,
      startHalftimeCountdown,
      stopHalftimeCountdown,
      completeCountdownIfCurrent,
      applyHalfStopIfCurrent,
      removeTimeoutIfCurrent,
      removePenaltyIfCurrent,
      completeAssetIfCurrent,
      writeEligible,
      writeFreshness,
      updateRedCards,
      getServerTime,
      updateController,
      selectView,
      selectAssetView,
      createQueue,
      replaceQueue,
      appendSubstitutionAndActivate,
      deleteQueue,
      renameQueue,
      reorderQueues,
      addItemsToQueue,
      removeItemFromQueue,
      reorderItemsInQueue,
      updateQueueSettings,
      playQueue,
      activateQueue,
      stopPlaying,
      showItemNow,
      setPlaying,
      renderAsset,
      showNextAsset,
      remoteRefresh,
      setRoster,
      editPlayer,
      deletePlayer,
      addPlayer,
      clearRoster,
      selectTab,
      updateView,
      setViewPort,
      setBackground,
      setIdleImage,
      setIdleAd,
      setBlackoutStart,
      setBlackoutEnd,
      setGoalGifSettings,
      setTheme,
      setThemePreset,
      saveCustomPreset,
      deleteCustomPreset,
      saveClubOverride,
      commitClubOverride,
      mutationError,
      dismissMutationError,
      deleteClubOverride,
      setPerimeterState,
      skipPerimeterCue,
      restartPerimeterDisplays,
      setPerimeterOverlay,
      clearPerimeterOverlay,
      perimeterOverlay,
      setPerimeterAdLayout,
      createPerimeterMediaPair,
      setPerimeterMediaPairMainScreenAsset,
      deletePerimeterMediaPair,
      setPerimeterGoalVideo,
      setPerimeterScorerCelebration,
      setPerimeterIdleClock,
      setPerimeterPlayerDisplayStyle,
      setPerimeterSubstitutionStyle,
      perimeterGoalVideo,
      perimeterMediaPairs,
      perimeterAdLayout,
      perimeterBrightness,
      perimeterBrightnessStatus,
      setPerimeterBrightness,
      perimeterBrightnessAuto,
      setPerimeterBrightnessAuto,
    ],
  );

  return (
    <FirebaseStateContext.Provider value={value}>
      {children}
    </FirebaseStateContext.Provider>
  );
};

export const useFirebaseState = () => {
  const context = useContext(FirebaseStateContext);
  if (!context) {
    throw new Error(
      "useFirebaseState must be used within a FirebaseStateProvider",
    );
  }
  return context;
};

export const useMatch = () => {
  const {
    match,
    updateMatch,
    startMatch,
    pauseMatch,
    resetMatch,
    addGoal,
    addPenalty,
    removePenalty,
    addToPenalty,
    updateHalfLength,
    adjustMatchTime,
    setHalfStops,
    matchTimeout,
    removeTimeout,
    buzz,
    countdown,
    startHalftimeCountdown,
    stopHalftimeCountdown,
    completeCountdownIfCurrent,
    applyHalfStopIfCurrent,
    removeTimeoutIfCurrent,
    removePenaltyIfCurrent,
    updateRedCards,
    getServerTime,
    writeEligible,
  } = useFirebaseState();
  return {
    match,
    updateMatch,
    startMatch,
    pauseMatch,
    resetMatch,
    addGoal,
    addPenalty,
    removePenalty,
    addToPenalty,
    updateHalfLength,
    adjustMatchTime,
    setHalfStops,
    matchTimeout,
    removeTimeout,
    buzz,
    countdown,
    startHalftimeCountdown,
    stopHalftimeCountdown,
    completeCountdownIfCurrent,
    applyHalfStopIfCurrent,
    removeTimeoutIfCurrent,
    removePenaltyIfCurrent,
    updateRedCards,
    getServerTime,
    writeEligible,
  };
};

export const useController = () => {
  const {
    controller,
    updateController,
    selectView,
    selectAssetView,
    createQueue,
    replaceQueue,
    appendSubstitutionAndActivate,
    deleteQueue,
    renameQueue,
    reorderQueues,
    addItemsToQueue,
    removeItemFromQueue,
    reorderItemsInQueue,
    updateQueueSettings,
    playQueue,
    activateQueue,
    stopPlaying,
    showItemNow,
    setPlaying,
    renderAsset,
    showNextAsset,
    completeAssetIfCurrent,
    remoteRefresh,
    setRoster,
    editPlayer,
    deletePlayer,
    addPlayer,
    clearRoster,
    selectTab,
  } = useFirebaseState();
  return {
    controller,
    updateController,
    selectView,
    selectAssetView,
    createQueue,
    replaceQueue,
    appendSubstitutionAndActivate,
    deleteQueue,
    renameQueue,
    reorderQueues,
    addItemsToQueue,
    removeItemFromQueue,
    reorderItemsInQueue,
    updateQueueSettings,
    playQueue,
    activateQueue,
    stopPlaying,
    showItemNow,
    setPlaying,
    renderAsset,
    showNextAsset,
    completeAssetIfCurrent,
    remoteRefresh,
    setRoster,
    editPlayer,
    deletePlayer,
    addPlayer,
    clearRoster,
    selectTab,
  };
};

export const useView = () => {
  const {
    view,
    updateView,
    setViewPort,
    setBackground,
    setIdleImage,
    setIdleAd,
    setBlackoutStart,
    setBlackoutEnd,
    setGoalGifSettings,
    setTheme,
    setThemePreset,
    saveCustomPreset,
    deleteCustomPreset,
  } = useFirebaseState();
  return {
    view,
    updateView,
    setViewPort,
    setBackground,
    setIdleImage,
    setIdleAd,
    setBlackoutStart,
    setBlackoutEnd,
    setGoalGifSettings,
    setTheme,
    setThemePreset,
    saveCustomPreset,
    deleteCustomPreset,
  };
};

export const useListeners = () => {
  const { listeners } = useFirebaseState();
  return listeners;
};

export const useClubOverrides = () => {
  const {
    clubOverrides,
    saveClubOverride,
    commitClubOverride,
    deleteClubOverride,
  } = useFirebaseState();
  return {
    clubOverrides,
    saveClubOverride,
    commitClubOverride,
    deleteClubOverride,
  };
};

export const usePerimeter = () => {
  const {
    perimeter,
    setPerimeterState,
    skipPerimeterCue,
    restartPerimeterDisplays,
    setPerimeterOverlay,
    clearPerimeterOverlay,
    setPerimeterAdLayout,
    createPerimeterMediaPair,
    setPerimeterMediaPairMainScreenAsset,
    deletePerimeterMediaPair,
    setPerimeterGoalVideo,
    setPerimeterScorerCelebration,
    setPerimeterIdleClock,
    setPerimeterPlayerDisplayStyle,
    setPerimeterSubstitutionStyle,
    mediaPairs,
    perimeterGoalVideo,
    perimeterOverlay,
    perimeterAdLayout,
    perimeterBrightness,
    perimeterBrightnessStatus,
    setPerimeterBrightness,
    perimeterBrightnessAuto,
    setPerimeterBrightnessAuto,
    getServerTime,
    writeEligible,
  } = useFirebaseState();
  return {
    perimeter,
    setPerimeterState,
    skipPerimeterCue,
    restartPerimeterDisplays,
    setPerimeterOverlay,
    clearPerimeterOverlay,
    setPerimeterAdLayout,
    setPerimeterScorerCelebration,
    setPerimeterIdleClock,
    setPerimeterPlayerDisplayStyle,
    setPerimeterSubstitutionStyle,
    createPerimeterMediaPair,
    setPerimeterMediaPairMainScreenAsset,
    deletePerimeterMediaPair,
    setPerimeterGoalVideo,
    mediaPairs,
    goalVideo: perimeterGoalVideo,
    overlay: perimeterOverlay,
    adLayout: perimeterAdLayout,
    brightness: perimeterBrightness,
    brightnessStatus: perimeterBrightnessStatus,
    setPerimeterBrightness,
    brightnessAuto: perimeterBrightnessAuto,
    setPerimeterBrightnessAuto,
    getServerTime,
    writeEligible,
  };
};
