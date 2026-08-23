import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { database, storageHelpers, FIREBASE_STORAGE_BUCKET } from "../firebase";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { ref, onValue, set } from "firebase/database";
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
  Player,
  Roster,
  TwoMinPenalty,
  QueueState,
  ClubOverride,
  PerimeterState,
  PerimeterPreview,
  PerimeterOverlay,
  PerimeterOverlayStatus,
  PerimeterMediaPair,
  PerimeterAdLayout,
  PerimeterAppliedAdLayout,
  AuditStateArea,
  PerimeterBrightnessStatus,
  PerimeterOverlayGeometry,
  GoalScorerPreparationStatus,
  GoalScorerPreparationRequest,
} from "../types";
import {
  firebaseDatabase,
  generateClubOverrideId,
  saveClubOverride as firebaseSaveClubOverride,
  deleteClubOverride as firebaseDeleteClubOverride,
  AuditEventPayload,
} from "../firebaseDatabase";
import { getOrCreateSessionId } from "../lib/sessionId";
import { Sports, DEFAULT_HALFSTOPS, VIEWS } from "../constants";
import { msUntilMatchStart } from "../utils/timeUtils";
import { isHalftimeTransitionEligible } from "../utils/matchUtils";
import clubIds from "../club-ids";
import assetTypes from "../controller/asset/AssetTypes";
import {
  parseLocations,
  parseMatch,
  parseController,
  parseView,
  parseClubOverrides,
  parsePerimeterState,
  parsePerimeterPreview,
  parsePerimeterOverlay,
  parsePerimeterMediaPairs,
  parsePerimeterAdLayout,
  parsePerimeterAppliedAdLayout,
  parsePerimeterBrightness,
  parsePerimeterBrightnessStatus,
  parsePerimeterOverlayGeometry,
  parseGoalScorerPreparationStatus,
} from "./firebaseParsers";

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
  screens: [],
};

const defaultClubOverrides: Record<string, ClubOverride> = {};

const defaultPerimeter: PerimeterState = { enabled: false, state: "off" };

const defaultPerimeterPreview: PerimeterPreview | null = null;

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

        for (const queueId of Object.keys(nextQueues)) {
          if (prevQueues[queueId] !== nextQueues[queueId]) {
            diff[`queues/${queueId}`] = nextQueues[queueId];
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

interface FirebaseStateContextType {
  match: Match;
  controller: ControllerState;
  view: ViewState;
  listeners: ListenersState;
  clubOverrides: Record<string, ClubOverride>;
  perimeter: PerimeterState;
  perimeterPreview: PerimeterPreview | null;
  perimeterPreviewLoaded: boolean;
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
  setHalfStops: (halfStops: number[], mode: InjuryTimeDisplayMode) => void;
  matchTimeout: (team: "home" | "away") => void;
  removeTimeout: () => void;
  buzz: (on: boolean) => void;
  countdown: () => void;
  startHalftimeCountdown: () => void;
  stopHalftimeCountdown: () => void;
  updateRedCards: (home: number, away: number) => void;
  getServerTime: () => number;

  updateController: (updates: Partial<ControllerState>) => void;
  selectView: (view: string) => void;
  selectAssetView: (assetView: string) => void;
  createQueue: (name: string, options?: { cycle?: boolean }) => string;
  deleteQueue: (queueId: string) => void;
  renameQueue: (queueId: string, name: string) => void;
  reorderQueues: (orderedIds: string[]) => void;
  addItemsToQueue: (queueId: string, assets: Asset[]) => void;
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
  renderAsset: (asset: Asset | null) => void;
  showNextAsset: () => void;
  removeAssetAfterTimeout: () => void;
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
  saveCustomPreset: (id: string, preset: CustomPreset) => void;
  deleteCustomPreset: (id: string) => void;

  saveClubOverride: (
    override: Omit<ClubOverride, "logoUrl"> & { logoFile: File },
  ) => Promise<void>;
  deleteClubOverride: (id: string) => Promise<void>;

  setPerimeterState: (state: PerimeterState["state"]) => void;
  setPerimeterOverlay: (overlay: PerimeterOverlay) => void;
  clearPerimeterOverlay: () => void;
  setPerimeterAdLayout: (layout: PerimeterAdLayout | null) => Promise<void>;
  createPerimeterMediaPair: (
    pairId: string,
    pair: PerimeterMediaPair,
  ) => Promise<void>;
  deletePerimeterMediaPair: (pairId: string) => Promise<void>;
  mediaPairs: Record<string, PerimeterMediaPair>;
  perimeterOverlay: PerimeterOverlay | null;
  perimeterOverlayStatus: PerimeterOverlayStatus | null;
  perimeterAdLayout: PerimeterAdLayout | null;
  perimeterAppliedAdLayout: PerimeterAppliedAdLayout | undefined;
  perimeterAppliedAdLayoutLoaded: boolean;
  perimeterAppliedAdLayoutError: string | null;
  perimeterBrightness: number | null;
  perimeterBrightnessStatus: PerimeterBrightnessStatus | null;
  setPerimeterBrightness: (percent: number) => Promise<void>;
  overlayGeometry: PerimeterOverlayGeometry | null;
  goalScorerPreparationStatus: GoalScorerPreparationStatus | null;
  requestGoalScorerPreparation: () => Promise<void>;
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

interface FirebaseStateProviderProps {
  children: ReactNode;
  listenPrefix: string;
  isAuthenticated: boolean;
  screenKey: string | null;
  // Authenticated operator identity (Firebase Auth UID) used for audit events.
  // Required in production whenever isAuthenticated is true; absent only in
  // tests/development where firebaseDatabase is mocked.
  uid?: string;
}

export const FirebaseStateProvider: React.FC<FirebaseStateProviderProps> = ({
  children,
  listenPrefix,
  isAuthenticated,
  screenKey,
  uid,
}) => {
  const [match, setMatch] = useState<Match>(defaultMatch);
  const [controller, setController] =
    useState<ControllerState>(defaultController);
  const [view, setView] = useState<ViewState>(defaultView);
  const [listeners, setListeners] = useState<ListenersState>(defaultListeners);
  const [clubOverrides, setClubOverrides] =
    useState<Record<string, ClubOverride>>(defaultClubOverrides);
  const [perimeter, setPerimeter] = useState<PerimeterState>(defaultPerimeter);
  const [perimeterPreview, setPerimeterPreview] =
    useState<PerimeterPreview | null>(defaultPerimeterPreview);
  const [perimeterPreviewLoaded, setPerimeterPreviewLoaded] = useState(false);
  const [perimeterOverlay, setOverlay] = useState<PerimeterOverlay | null>(
    null,
  );
  const [perimeterOverlayStatus, setPerimeterOverlayStatus] =
    useState<PerimeterOverlayStatus | null>(null);
  const [perimeterAdLayout, setPerimeterAdLayoutState] =
    useState<PerimeterAdLayout | null>(null);
  const [perimeterMediaPairs, setMediaPairs] = useState<
    Record<string, PerimeterMediaPair>
  >({});
  const [perimeterAppliedAdLayout, setPerimeterAppliedAdLayout] = useState<
    PerimeterAppliedAdLayout | undefined
  >(undefined);
  const [perimeterAppliedAdLayoutLoaded, setPerimeterAppliedAdLayoutLoaded] =
    useState(false);
  const [perimeterAppliedAdLayoutError, setPerimeterAppliedAdLayoutError] =
    useState<string | null>(null);
  const [perimeterBrightness, setPerimeterBrightnessState] = useState<
    number | null
  >(null);
  const [perimeterBrightnessStatus, setPerimeterBrightnessStatus] =
    useState<PerimeterBrightnessStatus | null>(null);
  const [overlayGeometry, setOverlayGeometry] =
    useState<PerimeterOverlayGeometry | null>(null);
  const [goalScorerPreparationStatus, setGoalScorerPreparationStatus] =
    useState<GoalScorerPreparationStatus | null>(null);
  const [ready, setReady] = useState(!listenPrefix);

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
    setPerimeterPreview(defaultPerimeterPreview);
    setPerimeterPreviewLoaded(false);
    setPerimeterAdLayoutState(null);
    setMediaPairs({});
    setPerimeterAppliedAdLayout(undefined);
    setPerimeterAppliedAdLayoutLoaded(false);
    setPerimeterAppliedAdLayoutError(null);
    setOverlayGeometry(null);
    setGoalScorerPreparationStatus(null);
  }

  useEffect(() => {
    matchRef.current = match;
  }, [match]);
  useEffect(() => {
    controllerRef.current = controller;
  }, [controller]);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    clubOverridesRef.current = clubOverrides;
  }, [clubOverrides]);

  // Builds the identity payload for an audited mutation, or null when the
  // provider is not in a position to write (unauthenticated or no venue).
  // Every successful authenticated mutation MUST carry an audit record, so
  // callers skip the write entirely when this returns null.
  const makeAudit = useCallback(
    (stateArea: AuditStateArea, action: string): AuditEventPayload | null => {
      if (!listenPrefix || !isAuthenticated) return null;
      return {
        uid: uid ?? "",
        sessionId: getOrCreateSessionId(),
        action,
        stateArea,
      };
    },
    [isAuthenticated, listenPrefix, uid],
  );

  useEffect(() => {
    const locationsRef = ref(database, "locations");
    const unsubLocations = onValue(locationsRef, (snapshot) => {
      const parsed = parseLocations(snapshot.val());
      if (parsed) {
        setListeners(parsed);
      }
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

  useEffect(() => {
    if (listenPrefix) {
      // Reset the transition baseline so a new venue's loaded view is treated
      // as an initial load, never a stale cross-venue transition.
      prevControllerViewRef.current = null;

      let matchReady = false;
      let controllerReady = false;
      let viewReady = false;
      let clubOverridesReady = false;
      let perimeterReady = false;

      const checkReady = () => {
        if (
          matchReady &&
          controllerReady &&
          viewReady &&
          clubOverridesReady &&
          perimeterReady
        ) {
          setReady(true);
        }
      };

      const matchPath = `states/${listenPrefix}/match`;
      const controllerPath = `states/${listenPrefix}/controller`;
      const viewPath = `states/${listenPrefix}/view`;
      const clubOverridesPath = `states/${listenPrefix}/clubOverrides`;
      const perimeterPath = `states/${listenPrefix}/perimeter`;
      const perimeterPreviewPath = `perimeter/${listenPrefix}`;

      const unsubMatch = onValue(
        ref(database, matchPath),
        (snapshot) => {
          const results = parseMatch(snapshot.val(), defaultMatch);
          if (results) {
            setMatch(results);
          } else {
            setMatch(defaultMatch);
          }
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
          const results = parseController(snapshot.val(), defaultController);
          setController(results ?? defaultController);
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
          const results = parseView(snapshot.val(), defaultView);
          setView(results ?? defaultView);
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
          const results = parseClubOverrides(snapshot.val());
          setClubOverrides(results ?? defaultClubOverrides);
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
          const raw: unknown = snapshot.val();
          setPerimeter(parsePerimeterState(raw) ?? defaultPerimeter);
          const overlay =
            raw && typeof raw === "object"
              ? parsePerimeterOverlay(
                  (raw as Record<string, unknown>).overlay ?? null,
                  { location: listenPrefix },
                )
              : null;
          setOverlay(overlay);
          if (!perimeterReady) {
            perimeterReady = true;
            checkReady();
          }
        },
        (error) =>
          console.error("Firebase perimeter subscription error:", error),
      );

      // The preview snapshot is published by the perimeter-control daemon to
      // `perimeter/{location}`. It is deliberately NOT part of readiness:
      // absent metadata must not block the controller.
      const unsubPerimeterPreview = onValue(
        ref(database, perimeterPreviewPath),
        (snapshot) => {
          setPerimeterPreviewLoaded(true);
          setPerimeterPreview(
            parsePerimeterPreview(snapshot.val()) ?? defaultPerimeterPreview,
          );
        },
        (error) =>
          console.error(
            "Firebase perimeter preview subscription error:",
            error,
          ),
      );

      const overlayStatusPath = `perimeter/${listenPrefix}/overlayStatus`;
      const unsubOverlayStatus = onValue(
        ref(database, overlayStatusPath),
        (snapshot) => {
          const raw: unknown = snapshot.val();
          if (!raw || typeof raw !== "object") {
            setPerimeterOverlayStatus(null);
            return;
          }
          const status = raw as Record<string, unknown>;
          setPerimeterOverlayStatus({
            commandId:
              typeof status.commandId === "string" ? status.commandId : null,
            phase:
              typeof status.phase === "string"
                ? (status.phase as PerimeterOverlayStatus["phase"])
                : "error",
            activeColumn:
              typeof status.activeColumn === "number" ? status.activeColumn : 0,
            error: typeof status.error === "string" ? status.error : null,
          });
        },
        (error) =>
          console.error(
            "Firebase perimeter overlayStatus subscription error:",
            error,
          ),
      );

      // Ad-layout subscriptions: desired (states/*/perimeter/adLayout) and
      // daemon-published applied (perimeter/*/adLayout).
      const adLayoutPath = `states/${listenPrefix}/perimeter/adLayout`;
      const unsubAdLayout = onValue(
        ref(database, adLayoutPath),
        (snapshot) => {
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

      const appliedAdLayoutPath = `perimeter/${listenPrefix}/adLayout`;
      const unsubAppliedAdLayout = onValue(
        ref(database, appliedAdLayoutPath),
        (snapshot) => {
          setPerimeterAppliedAdLayoutError(null);
          setPerimeterAppliedAdLayoutLoaded(true);
          setPerimeterAppliedAdLayout(
            parsePerimeterAppliedAdLayout(snapshot.val()),
          );
        },
        (error) => {
          console.error(
            "Firebase perimeter appliedAdLayout subscription error:",
            error,
          );
          // Mark the initial load complete so the modal does not show an
          // endless loading spinner; expose the failure so operators can
          // distinguish a denied/failed subscription from a slow one.
          setPerimeterAppliedAdLayoutError(
            "Gat ekki sótt stöðu jaðarskjás (ábending gæti vantað heimildir).",
          );
          setPerimeterAppliedAdLayoutLoaded(true);
        },
      );

      // Named perimeter media pairs: an operator-curated library of overlay
      // pairs stored under states/{listenPrefix}/perimeter/mediaPairs.
      const mediaPairsPath = `states/${listenPrefix}/perimeter/mediaPairs`;
      const unsubMediaPairs = onValue(
        ref(database, mediaPairsPath),
        (snapshot) => {
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
          setPerimeterBrightnessState(parsePerimeterBrightness(snapshot.val()));
        },
        (error) =>
          console.error(
            "Firebase perimeter brightness subscription error:",
            error,
          ),
      );

      const brightnessStatusPath = `perimeter/${listenPrefix}/brightnessStatus`;
      const unsubBrightnessStatus = onValue(
        ref(database, brightnessStatusPath),
        (snapshot) => {
          setPerimeterBrightnessStatus(
            parsePerimeterBrightnessStatus(snapshot.val()),
          );
        },
        (error) =>
          console.error(
            "Firebase perimeter brightnessStatus subscription error:",
            error,
          ),
      );

      // Daemon-published overlay target geometry and the service-owned
      // goal-scorer preparation status. Both are read-only to clients and
      // deliberately NOT part of readiness.
      const overlayGeometryPath = `perimeter/${listenPrefix}/overlayGeometry`;
      const unsubOverlayGeometry = onValue(
        ref(database, overlayGeometryPath),
        (snapshot) => {
          setOverlayGeometry(parsePerimeterOverlayGeometry(snapshot.val()));
        },
        (error) =>
          console.error(
            "Firebase perimeter overlayGeometry subscription error:",
            error,
          ),
      );

      const goalScorerPreparationPath = `perimeter/${listenPrefix}/goalScorerPreparation`;
      const unsubGoalScorerPreparation = onValue(
        ref(database, goalScorerPreparationPath),
        (snapshot) => {
          setGoalScorerPreparationStatus(
            parseGoalScorerPreparationStatus(snapshot.val(), {
              location: listenPrefix,
              bucket: FIREBASE_STORAGE_BUCKET,
            }),
          );
        },
        (error) =>
          console.error(
            "Firebase perimeter goalScorerPreparation subscription error:",
            error,
          ),
      );

      return () => {
        unsubMatch();
        unsubController();
        unsubView();
        unsubClubOverrides();
        unsubPerimeter();
        unsubPerimeterPreview();
        unsubOverlayStatus();
        unsubAdLayout();
        unsubAppliedAdLayout();
        unsubMediaPairs();
        unsubBrightness();
        unsubBrightnessStatus();
        unsubOverlayGeometry();
        unsubGoalScorerPreparation();
      };
    }
  }, [listenPrefix]);

  const applyMatchUpdate = useCallback(
    (getNewState: (prev: Match) => Match, action: string) => {
      if (!listenPrefix) return;

      const prev = matchRef.current;
      const newState = getNewState(prev);
      if (isAuthenticated) {
        matchRef.current = newState;

        // Compute diff: only send changed fields to avoid Firebase
        // emulator issues with full-object update() calls
        const diff: Record<string, unknown> = {};
        for (const key of Object.keys(newState) as (keyof Match)[]) {
          const oldVal = prev[key];
          const newVal = newState[key];
          if (oldVal !== newVal) {
            diff[key] = newVal;
          }
        }

        if (Object.keys(diff).length > 0) {
          const audit = makeAudit("match", action);
          if (audit) {
            firebaseDatabase
              .writeAudited(listenPrefix, "match", diff, audit)
              .catch(console.error);
          }
        }
      }
    },
    [isAuthenticated, listenPrefix, makeAudit],
  );

  const applyControllerUpdate = useCallback(
    (
      getNewState: (prev: ControllerState) => ControllerState,
      action: string,
    ) => {
      if (!listenPrefix) return;

      const prev = controllerRef.current;
      const newState = getNewState(prev);
      if (isAuthenticated) {
        controllerRef.current = newState;

        const diff = computeControllerDiff(prev, newState);

        if (Object.keys(diff).length > 0) {
          const audit = makeAudit("controller", action);
          if (audit) {
            firebaseDatabase
              .writeAudited(listenPrefix, "controller", diff, audit)
              .catch(console.error);
          }
        }
      }
    },
    [isAuthenticated, listenPrefix, makeAudit],
  );

  const applyViewUpdate = useCallback(
    (getNewState: (prev: ViewState) => ViewState, action: string) => {
      if (!listenPrefix) return;

      const prev = viewRef.current;
      const newState = getNewState(prev);
      if (isAuthenticated) {
        viewRef.current = newState;

        const diff: Record<string, unknown> = {};
        for (const key of Object.keys(newState) as (keyof ViewState)[]) {
          const oldVal = prev[key];
          const newVal = newState[key];
          if (oldVal !== newVal) {
            // Firebase update() rejects undefined; use null to delete a key
            diff[key] = newVal === undefined ? null : newVal;
          }
        }

        // Also detect keys removed from newState (present in prev, absent in new)
        for (const key of Object.keys(prev) as (keyof ViewState)[]) {
          if (!(key in newState) && !(key in diff) && prev[key] !== undefined) {
            diff[key] = null;
          }
        }

        if (Object.keys(diff).length > 0) {
          const audit = makeAudit("view", action);
          if (audit) {
            firebaseDatabase
              .writeAudited(listenPrefix, "view", diff, audit)
              .catch(console.error);
          }
        }
      }
    },
    [isAuthenticated, listenPrefix, makeAudit],
  );

  const updateMatch = useCallback(
    (updates: Partial<Match>) => {
      if (!listenPrefix || !isAuthenticated) return;

      const prev = matchRef.current;
      const newState: Match = { ...prev, ...updates };
      const clubIdsMap = clubIds as Record<string, string>;
      const normalizeTeamName = (name: string): string => {
        const override = findClubOverrideByName(clubOverridesRef.current, name);
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

      matchRef.current = newState;

      const audit = makeAudit("match", "match.update");
      if (audit) {
        firebaseDatabase
          .writeAudited(listenPrefix, "match", partialData, audit)
          .catch(console.error);
      }
    },
    [isAuthenticated, listenPrefix, makeAudit],
  );

  const getServerTime = useCallback(
    () => Date.now() + serverTimeOffsetRef.current,
    [],
  );

  const startMatch = useCallback(() => {
    applyMatchUpdate(
      (prev) => ({
        ...prev,
        started: getServerTime(),
        countdown: false,
        halftimeCountdown: false,
      }),
      "match.start",
    );
  }, [applyMatchUpdate, getServerTime]);

  const pauseMatch = useCallback(
    (isHalfEnd?: boolean) => {
      applyMatchUpdate((prev) => {
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
      }, "match.pause");
    },
    [applyMatchUpdate, getServerTime],
  );

  const resetMatch = useCallback(() => {
    applyMatchUpdate(
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
      applyMatchUpdate((prev) => {
        const scoreKeys = { home: "homeScore", away: "awayScore" } as const;
        const key = scoreKeys[team];
        return { ...prev, [key]: prev[key] + 1 };
      }, "match.add-goal");
    },
    [applyMatchUpdate],
  );

  const addPenalty = useCallback(
    (team: "home" | "away", key: string, penaltyLength: number) => {
      applyMatchUpdate((prev) => {
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
      applyMatchUpdate((prev) => {
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
      applyMatchUpdate((prev) => {
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
      applyMatchUpdate((prev) => {
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

  const setHalfStops = useCallback(
    (halfStops: number[], mode: InjuryTimeDisplayMode) => {
      applyMatchUpdate(
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
      applyMatchUpdate((prev) => {
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
    applyMatchUpdate(
      (prev) => ({ ...prev, timeout: 0 }),
      "match.remove-timeout",
    );
  }, [applyMatchUpdate]);

  const buzz = useCallback(
    (on: boolean) => {
      applyMatchUpdate(
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
    applyMatchUpdate((prev) => {
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
    applyMatchUpdate((prev) => {
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
    applyMatchUpdate((prev) => {
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

  const updateRedCards = useCallback(
    (home: number, away: number) => {
      applyMatchUpdate(
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
    (updates: Partial<ControllerState>) => {
      applyControllerUpdate(
        (prev) => ({
          ...prev,
          ...updates,
        }),
        "controller.update",
      );
    },
    [applyControllerUpdate],
  );

  const selectView = useCallback(
    (view: string) => {
      applyControllerUpdate(
        (prev) => ({ ...prev, view }),
        "controller.select-view",
      );
    },
    [applyControllerUpdate],
  );

  const selectAssetView = useCallback(
    (assetView: string) => {
      applyControllerUpdate(
        (prev) => ({ ...prev, assetView }),
        "controller.select-asset-view",
      );
    },
    [applyControllerUpdate],
  );

  const createQueue = useCallback(
    (name: string, options?: { cycle?: boolean }) => {
      const queueId = `queue-${crypto.randomUUID()}`;
      applyControllerUpdate((prev) => {
        const existingOrders = Object.values(prev.queues).map((q) => q.order);
        const nextOrder = existingOrders.length
          ? Math.max(...existingOrders) + 1
          : 0;
        const newQueue: QueueState = {
          id: queueId,
          name,
          items: [],
          autoPlay: false,
          imageSeconds: 3,
          cycle: options?.cycle ?? true,
          order: nextOrder,
        };
        return {
          ...prev,
          queues: { ...prev.queues, [queueId]: newQueue },
        };
      }, "controller.create-queue");
      return queueId;
    },
    [applyControllerUpdate],
  );

  const deleteQueue = useCallback(
    (queueId: string) => {
      applyControllerUpdate((prev) => {
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
      }, "controller.delete-queue");
    },
    [applyControllerUpdate],
  );

  const renameQueue = useCallback(
    (queueId: string, name: string) => {
      applyControllerUpdate((prev) => {
        const queue = prev.queues[queueId];
        if (!queue) return prev;
        return {
          ...prev,
          queues: { ...prev.queues, [queueId]: { ...queue, name } },
        };
      }, "controller.rename-queue");
    },
    [applyControllerUpdate],
  );

  const reorderQueues = useCallback(
    (orderedIds: string[]) => {
      applyControllerUpdate((prev) => {
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
      }, "controller.reorder-queues");
    },
    [applyControllerUpdate],
  );

  const addItemsToQueue = useCallback(
    (queueId: string, assets: Asset[]) => {
      applyControllerUpdate(
        (prev) => getStateWithAddedItems(prev, queueId, assets),
        "controller.add-items-to-queue",
      );
    },
    [applyControllerUpdate],
  );

  const removeItemFromQueue = useCallback(
    (queueId: string, assetKey: string) => {
      applyControllerUpdate((prev) => {
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
      }, "controller.remove-item-from-queue");
    },
    [applyControllerUpdate],
  );

  const reorderItemsInQueue = useCallback(
    (queueId: string, items: Asset[]) => {
      applyControllerUpdate((prev) => {
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
      }, "controller.reorder-items-in-queue");
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
      applyControllerUpdate((prev) => {
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
      }, "controller.update-queue-settings");
    },
    [applyControllerUpdate],
  );

  const playQueue = useCallback(
    (queueId: string) => {
      applyControllerUpdate((prev) => {
        return getStateShowingNextAsset({
          ...prev,
          activeQueueId: queueId,
        });
      }, "controller.play-queue");
    },
    [applyControllerUpdate],
  );

  const activateQueue = useCallback(
    (queueId: string) => {
      applyControllerUpdate(
        (prev) => ({
          ...prev,
          activeQueueId: queueId,
        }),
        "controller.activate-queue",
      );
    },
    [applyControllerUpdate],
  );

  const stopPlaying = useCallback(() => {
    applyControllerUpdate(
      (prev) => ({ ...prev, playing: false }),
      "controller.stop-playing",
    );
  }, [applyControllerUpdate]);

  const setPlaying = useCallback(
    (playing: boolean) => {
      applyControllerUpdate(
        (prev) => ({ ...prev, playing }),
        "controller.set-playing",
      );
    },
    [applyControllerUpdate],
  );

  const renderAsset = useCallback(
    (asset: Asset | null) => {
      applyControllerUpdate(
        (prev) => ({
          ...prev,
          currentAsset: asset ? { asset, time: null } : null,
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
      renderAsset(asset);
    },
    [renderAsset],
  );

  const showNextAsset = useCallback(() => {
    applyControllerUpdate(
      (prev) => getStateShowingNextAsset(prev),
      "controller.show-next-asset",
    );
  }, [applyControllerUpdate]);

  const removeAssetAfterTimeout = useCallback(() => {
    applyControllerUpdate((prev) => {
      const activeQueue = prev.activeQueueId
        ? prev.queues[prev.activeQueueId]
        : null;
      if (!activeQueue) {
        return { ...prev, playing: false, currentAsset: null };
      }
      if (activeQueue.autoPlay) {
        if (prev.playing) {
          return getStateShowingNextAsset(prev);
        }
        return prev;
      }
      return { ...prev, currentAsset: null };
    }, "controller.remove-asset-after-timeout");
  }, [applyControllerUpdate]);

  const remoteRefresh = useCallback(() => {
    applyControllerUpdate(
      (prev) => ({
        ...prev,
        refreshToken: (Math.random() + 1).toString(36).substring(2),
      }),
      "controller.remote-refresh",
    );
  }, [applyControllerUpdate]);

  const setRoster = useCallback(
    (roster: Roster) => {
      applyControllerUpdate(
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
      applyControllerUpdate((prev) => {
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
      applyControllerUpdate((prev) => {
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
      applyControllerUpdate((prev) => {
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
    applyControllerUpdate(
      (prev) => ({
        ...prev,
        roster: { home: [], away: [] },
      }),
      "controller.clear-roster",
    );
  }, [applyControllerUpdate]);

  const selectTab = useCallback(
    (tab: string) => {
      applyControllerUpdate(
        (prev) => ({ ...prev, tab }),
        "controller.select-tab",
      );
    },
    [applyControllerUpdate],
  );

  const updateView = useCallback(
    (updates: Partial<ViewState>) => {
      applyViewUpdate((prev) => ({ ...prev, ...updates }), "view.update");
    },
    [applyViewUpdate],
  );

  const setViewPort = useCallback(
    (vp: ViewPort) => {
      applyViewUpdate((prev) => ({ ...prev, vp }), "view.set-viewport");
    },
    [applyViewUpdate],
  );

  const setBackground = useCallback(
    (background: string) => {
      applyViewUpdate(
        (prev) => ({ ...prev, background }),
        "view.set-background",
      );
    },
    [applyViewUpdate],
  );

  const setIdleImage = useCallback(
    (idleImage: string) => {
      applyViewUpdate(
        (prev) => ({ ...prev, idleImage }),
        "view.set-idle-image",
      );
    },
    [applyViewUpdate],
  );

  const setIdleAd = useCallback(
    (idleAd: string | null) => {
      applyViewUpdate((prev) => ({ ...prev, idleAd }), "view.set-idle-ad");
    },
    [applyViewUpdate],
  );

  const setBlackoutStart = useCallback(
    (blackoutStart: string | undefined) => {
      applyViewUpdate(
        (prev) => ({ ...prev, blackoutStart }),
        "view.set-blackout-start",
      );
    },
    [applyViewUpdate],
  );

  const setBlackoutEnd = useCallback(
    (blackoutEnd: string | undefined) => {
      applyViewUpdate(
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
      applyViewUpdate(
        (prev) => ({ ...prev, ...settings }),
        "view.set-goal-gif-settings",
      );
    },
    [applyViewUpdate],
  );

  const setTheme = useCallback(
    (theme: ThemeConfig | undefined) => {
      applyViewUpdate((prev) => ({ ...prev, theme }), "view.set-theme");
    },
    [applyViewUpdate],
  );

  const setThemePreset = useCallback(
    (preset: string | undefined) => {
      applyViewUpdate(
        (prev) => ({ ...prev, themePreset: preset }),
        "view.set-theme-preset",
      );
    },
    [applyViewUpdate],
  );

  const saveCustomPreset = useCallback(
    (id: string, preset: CustomPreset) => {
      applyViewUpdate((prev) => {
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
      applyViewUpdate((prev) => {
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

  const saveClubOverride = useCallback(
    async (override: Omit<ClubOverride, "logoUrl"> & { logoFile: File }) => {
      const audit = makeAudit("clubOverrides", "clubOverrides.save");
      if (!audit) return;

      try {
        const id = generateClubOverrideId();
        const storagePath = `${listenPrefix}/club-logos/${id}`;

        // Upload logo file to Storage
        await storageHelpers.uploadBytes(storagePath, override.logoFile);

        // Get download URL
        const logoUrl = await storageHelpers.getDownloadURL(storagePath);

        // Create ClubOverride object with download URL
        const clubOverride: ClubOverride = {
          name: override.name,
          clubId: override.clubId,
          logoUrl,
          isOverride: override.isOverride,
        };

        // Write to RTDB (atomic with its audit record)
        await firebaseSaveClubOverride(listenPrefix, id, clubOverride, audit);
      } catch (error) {
        console.error("Error saving club override:", error);
        throw error;
      }
    },
    [listenPrefix, makeAudit],
  );

  const deleteClubOverride = useCallback(
    async (id: string) => {
      const audit = makeAudit("clubOverrides", "clubOverrides.delete");
      if (!audit) return;

      try {
        await firebaseDeleteClubOverride(listenPrefix, id, audit);
      } catch (error) {
        console.error("Error deleting club override:", error);
        throw error;
      }
    },
    [listenPrefix, makeAudit],
  );

  const setPerimeterState = useCallback(
    (state: PerimeterState["state"]) => {
      const audit = makeAudit("perimeter", "perimeter.set-state");
      if (!audit) return;

      firebaseDatabase
        .writeAudited(listenPrefix, "perimeter", { state }, audit)
        .catch(console.error);
    },
    [makeAudit, listenPrefix],
  );

  const setPerimeterOverlay = useCallback(
    (overlay: PerimeterOverlay) => {
      const audit = makeAudit("perimeter", "perimeter.set-overlay");
      if (!audit) return;

      firebaseDatabase
        .writeAudited(listenPrefix, "perimeter", { overlay }, audit)
        .catch(console.error);
    },
    [makeAudit, listenPrefix],
  );

  const clearPerimeterOverlay = useCallback(() => {
    const audit = makeAudit("perimeter", "perimeter.clear-overlay");
    if (!audit) return;

    firebaseDatabase
      .writeAudited(listenPrefix, "perimeter", { overlay: null }, audit)
      .catch(console.error);
  }, [makeAudit, listenPrefix]);

  const setPerimeterAdLayout = useCallback(
    (layout: PerimeterAdLayout | null): Promise<void> => {
      const audit = makeAudit("perimeter", "perimeter.set-ad-layout");
      if (!audit) return Promise.resolve();
      // Let rejections propagate: the controller keeps its editor open and
      // shows an actionable error instead of silently treating a failed write
      // as saved.
      return firebaseDatabase.writeAudited(
        listenPrefix,
        "perimeter",
        { adLayout: layout },
        audit,
      );
    },
    [makeAudit, listenPrefix],
  );

  const setPerimeterBrightness = useCallback(
    (percent: number): Promise<void> => {
      if (!listenPrefix || !isAuthenticated) return Promise.resolve();
      if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
        console.warn(`Ignoring invalid brightness request: ${percent}`);
        return Promise.resolve();
      }
      // Let rejections propagate so the controller can clear its pending
      // state when a write fails instead of waiting forever on the
      // subscription (no optimistic local state).
      return set(
        ref(database, `states/${listenPrefix}/perimeter/brightness`),
        percent,
      );
    },
    [isAuthenticated, listenPrefix],
  );

  // Request background perimeter goal-scorer media preparation for the current
  // home roster. The controller writes the authoritative request (validated by
  // the RTDB rules) so the service-owned status stays tied to this roster, then
  // triggers the authenticated Cloud Function which performs the actual work.
  const requestGoalScorerPreparation = useCallback(async (): Promise<void> => {
    if (!listenPrefix || !isAuthenticated) return;
    const home = controllerRef.current?.roster?.home ?? [];
    const players = home
      .filter(
        (p) =>
          p.id !== undefined && p.id !== null && String(p.id).trim() !== "",
      )
      .map((p) => ({
        id: String(p.id),
        name: p.name ?? "",
        number: p.number,
      }));
    if (players.length === 0) return;

    const request: GoalScorerPreparationRequest = {
      jobId: crypto.randomUUID(),
      players,
    };
    try {
      await set(
        ref(database, `states/${listenPrefix}/perimeter/goalScorerPreparation`),
        request,
      );
      const callable = httpsCallable(functions, "prepareGoalScorerMedia");
      await callable({
        location: listenPrefix,
        jobId: request.jobId,
        players,
      });
    } catch (error) {
      console.error("Failed to request goal-scorer media preparation:", error);
    }
  }, [isAuthenticated, listenPrefix]);

  const createPerimeterMediaPair = useCallback(
    (pairId: string, pair: PerimeterMediaPair): Promise<void> => {
      const audit = makeAudit("perimeter", "perimeter.create-media-pair");
      if (!audit) return Promise.resolve();
      // Let rejections propagate so the create dialog can surface failures.
      return firebaseDatabase.writeAudited(
        listenPrefix,
        "perimeter",
        { [`mediaPairs/${pairId}`]: pair },
        audit,
      );
    },
    [makeAudit, listenPrefix],
  );

  const deletePerimeterMediaPair = useCallback(
    (pairId: string): Promise<void> => {
      const audit = makeAudit("perimeter", "perimeter.delete-media-pair");
      if (!audit) return Promise.resolve();
      // Removes only the Firebase library record; Storage assets are kept.
      return firebaseDatabase.writeAudited(
        listenPrefix,
        "perimeter",
        { [`mediaPairs/${pairId}`]: null },
        audit,
      );
    },
    [makeAudit, listenPrefix],
  );

  // Auto-start/stop the perimeter LEDs on view transitions: entering the match
  // view turns the perimeter on, leaving any view for idle turns it off. Only
  // writes when the perimeter is enabled, and only after initial subscriptions
  // have loaded so a reload/reconnect never replays a stale perimeter command.
  useEffect(() => {
    if (!ready) return;

    const nextView = controller.view;
    const prevView = prevControllerViewRef.current;
    prevControllerViewRef.current = nextView;

    if (prevView === null || prevView === nextView) return;
    if (!perimeter.enabled) return;

    if (prevView === VIEWS.idle && nextView === VIEWS.match) {
      setPerimeterState("on");
    } else if (nextView === VIEWS.idle) {
      setPerimeterState("off");
    }
  }, [ready, controller.view, perimeter.enabled, setPerimeterState]);

  // Request goal-scorer perimeter media preparation whenever the home roster
  // gains eligible players (match selection or match-report roster loading).
  // This runs in the background and never blocks the roster from becoming
  // available: the request write and callable fire-and-forget.
  const homeRosterSummary = useMemo(() => {
    const home = controller.roster.home ?? [];
    const entries = home.map((p) =>
      p.id !== undefined && p.id !== null && String(p.id).trim() !== ""
        ? `${String(p.id)}:${p.name ?? ""}:${String(p.number ?? "")}`
        : "",
    );
    return {
      signature: JSON.stringify(entries),
      hasEligible: entries.some((entry) => entry.length > 0),
    };
  }, [controller.roster.home]);
  useEffect(() => {
    if (!ready || !isAuthenticated || !homeRosterSummary.hasEligible) return;
    void requestGoalScorerPreparation();
  }, [homeRosterSummary, ready, isAuthenticated, requestGoalScorerPreparation]);

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
      perimeterPreview,
      perimeterPreviewLoaded,
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
      setHalfStops,
      matchTimeout,
      removeTimeout,
      buzz,
      countdown,
      startHalftimeCountdown,
      stopHalftimeCountdown,
      updateRedCards,
      getServerTime,
      updateController,
      selectView,
      selectAssetView,
      createQueue,
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
      removeAssetAfterTimeout,
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
      deleteClubOverride,
      setPerimeterState,
      setPerimeterOverlay,
      clearPerimeterOverlay,
      perimeterOverlay,
      perimeterOverlayStatus,
      setPerimeterAdLayout,
      createPerimeterMediaPair,
      deletePerimeterMediaPair,
      mediaPairs: perimeterMediaPairs,
      perimeterAdLayout,
      perimeterAppliedAdLayout,
      perimeterAppliedAdLayoutLoaded,
      perimeterAppliedAdLayoutError,
      perimeterBrightness,
      perimeterBrightnessStatus,
      setPerimeterBrightness,
      overlayGeometry,
      goalScorerPreparationStatus,
      requestGoalScorerPreparation,
    }),
    [
      match,
      controller,
      effectiveView,
      listeners,
      clubOverrides,
      perimeter,
      perimeterPreview,
      perimeterPreviewLoaded,
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
      setHalfStops,
      matchTimeout,
      removeTimeout,
      buzz,
      countdown,
      startHalftimeCountdown,
      stopHalftimeCountdown,
      updateRedCards,
      getServerTime,
      updateController,
      selectView,
      selectAssetView,
      createQueue,
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
      removeAssetAfterTimeout,
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
      deleteClubOverride,
      setPerimeterState,
      setPerimeterOverlay,
      clearPerimeterOverlay,
      perimeterOverlay,
      perimeterOverlayStatus,
      setPerimeterAdLayout,
      createPerimeterMediaPair,
      deletePerimeterMediaPair,
      perimeterMediaPairs,
      perimeterAdLayout,
      perimeterAppliedAdLayout,
      perimeterAppliedAdLayoutLoaded,
      perimeterAppliedAdLayoutError,
      perimeterBrightness,
      perimeterBrightnessStatus,
      setPerimeterBrightness,
      overlayGeometry,
      goalScorerPreparationStatus,
      requestGoalScorerPreparation,
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
    setHalfStops,
    matchTimeout,
    removeTimeout,
    buzz,
    countdown,
    startHalftimeCountdown,
    stopHalftimeCountdown,
    updateRedCards,
    getServerTime,
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
    setHalfStops,
    matchTimeout,
    removeTimeout,
    buzz,
    countdown,
    startHalftimeCountdown,
    stopHalftimeCountdown,
    updateRedCards,
    getServerTime,
  };
};

export const useController = () => {
  const {
    controller,
    updateController,
    selectView,
    selectAssetView,
    createQueue,
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
    removeAssetAfterTimeout,
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
    removeAssetAfterTimeout,
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
  const { clubOverrides, saveClubOverride, deleteClubOverride } =
    useFirebaseState();
  return {
    clubOverrides,
    saveClubOverride,
    deleteClubOverride,
  };
};

export const usePerimeter = () => {
  const {
    perimeter,
    perimeterPreview,
    perimeterPreviewLoaded,
    setPerimeterState,
    setPerimeterOverlay,
    clearPerimeterOverlay,
    setPerimeterAdLayout,
    createPerimeterMediaPair,
    deletePerimeterMediaPair,
    mediaPairs,
    perimeterOverlay,
    perimeterOverlayStatus,
    perimeterAdLayout,
    perimeterAppliedAdLayout,
    perimeterAppliedAdLayoutLoaded,
    perimeterAppliedAdLayoutError,
    perimeterBrightness,
    perimeterBrightnessStatus,
    setPerimeterBrightness,
    overlayGeometry,
    goalScorerPreparationStatus,
    requestGoalScorerPreparation,
    getServerTime,
  } = useFirebaseState();
  return {
    perimeter,
    preview: perimeterPreview,
    previewLoaded: perimeterPreviewLoaded,
    setPerimeterState,
    setPerimeterOverlay,
    clearPerimeterOverlay,
    setPerimeterAdLayout,
    createPerimeterMediaPair,
    deletePerimeterMediaPair,
    mediaPairs,
    overlay: perimeterOverlay,
    overlayStatus: perimeterOverlayStatus,
    adLayout: perimeterAdLayout,
    appliedAdLayout: perimeterAppliedAdLayout,
    appliedAdLayoutLoaded: perimeterAppliedAdLayoutLoaded,
    appliedAdLayoutError: perimeterAppliedAdLayoutError,
    brightness: perimeterBrightness,
    brightnessStatus: perimeterBrightnessStatus,
    setPerimeterBrightness,
    overlayGeometry,
    goalScorerPreparationStatus,
    requestGoalScorerPreparation,
    getServerTime,
  };
};
