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
import moment from "moment";
import { database } from "../firebase";
import { firebaseDatabase } from "../firebaseDatabase";
import { ref, onValue } from "firebase/database";
import {
  Match,
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
} from "../types";
import { Sports, DEFAULT_HALFSTOPS } from "../constants";
import clubIds from "../club-ids";
import assetTypes from "../controller/asset/AssetTypes";
import {
  parseLocations,
  parseMatch,
  parseController,
  parseView,
} from "./firebaseParsers";

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
  showInjuryTime: true,
  halfOffset: 0,
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
  ready: boolean;

  updateMatch: (updates: Partial<Match>) => void;
  startMatch: () => void;
  pauseMatch: (isHalfEnd?: boolean) => void;
  addGoal: (team: "home" | "away") => void;
  addPenalty: (
    team: "home" | "away",
    key: string,
    penaltyLength: number,
  ) => void;
  removePenalty: (key: string) => void;
  addToPenalty: (key: string, toAdd: number) => void;
  updateHalfLength: (currentValue: number, newValue: string) => void;
  setHalfStops: (halfStops: number[], showInjuryTime: boolean) => void;
  matchTimeout: (team: "home" | "away") => void;
  removeTimeout: () => void;
  buzz: (on: boolean) => void;
  countdown: () => void;
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
  setBlackoutStart: (blackoutStart: string | undefined) => void;
  setBlackoutEnd: (blackoutEnd: string | undefined) => void;
  setTheme: (theme: ThemeConfig | undefined) => void;
  setThemePreset: (preset: string | undefined) => void;
  saveCustomPreset: (id: string, preset: CustomPreset) => void;
  deleteCustomPreset: (id: string) => void;
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
    delete newState.queues[activeQueueId];
    newState.activeQueueId = null;
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
  screenViewport: ViewPort | null;
}

export const FirebaseStateProvider: React.FC<FirebaseStateProviderProps> = ({
  children,
  listenPrefix,
  isAuthenticated,
  screenViewport,
}) => {
  const [match, setMatch] = useState<Match>(defaultMatch);
  const [controller, setController] =
    useState<ControllerState>(defaultController);
  const [view, setView] = useState<ViewState>(defaultView);
  const [listeners, setListeners] = useState<ListenersState>(defaultListeners);
  const [ready, setReady] = useState(!listenPrefix);

  const matchRef = useRef(match);
  const controllerRef = useRef(controller);
  const viewRef = useRef(view);
  const serverTimeOffsetRef = useRef<number>(0);
  const [prevListenPrefix, setPrevListenPrefix] = useState(listenPrefix);

  // Reset ready when listenPrefix changes (using state comparison pattern per React docs)
  if (prevListenPrefix !== listenPrefix) {
    setPrevListenPrefix(listenPrefix);
    setReady(!listenPrefix);
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
      let matchReady = false;
      let controllerReady = false;
      let viewReady = false;

      const checkReady = () => {
        if (matchReady && controllerReady && viewReady) {
          setReady(true);
        }
      };

      const matchPath = `states/${listenPrefix}/match`;
      const controllerPath = `states/${listenPrefix}/controller`;
      const viewPath = `states/${listenPrefix}/view`;

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

      return () => {
        unsubMatch();
        unsubController();
        unsubView();
      };
    }
  }, [listenPrefix]);

  const applyMatchUpdate = useCallback(
    (getNewState: (prev: Match) => Match) => {
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
          firebaseDatabase
            .syncState(listenPrefix, "match", diff)
            .catch(console.error);
        }
      }
    },
    [isAuthenticated, listenPrefix],
  );

  const applyControllerUpdate = useCallback(
    (getNewState: (prev: ControllerState) => ControllerState) => {
      if (!listenPrefix) return;

      const prev = controllerRef.current;
      const newState = getNewState(prev);
      if (isAuthenticated) {
        controllerRef.current = newState;

        const diff = computeControllerDiff(prev, newState);

        if (Object.keys(diff).length > 0) {
          firebaseDatabase
            .syncState(listenPrefix, "controller", diff)
            .catch(console.error);
        }
      }
    },
    [isAuthenticated, listenPrefix],
  );

  const applyViewUpdate = useCallback(
    (getNewState: (prev: ViewState) => ViewState) => {
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
          firebaseDatabase
            .syncState(listenPrefix, "view", diff)
            .catch(console.error);
        }
      }
    },
    [isAuthenticated, listenPrefix],
  );

  const updateMatch = useCallback(
    (updates: Partial<Match>) => {
      if (!listenPrefix || !isAuthenticated) return;

      const prev = matchRef.current;
      const newState: Match = { ...prev, ...updates };
      const clubIdsMap = clubIds as Record<string, string>;
      const normalizeTeamName = (name: string): string => {
        if (clubIdsMap[name]) return name;
        const stripped = name.replace(/\.+$/, "");
        if (clubIdsMap[stripped]) return stripped;
        return name;
      };
      const lookupClubId = (name: string): string =>
        clubIdsMap[name] ?? clubIdsMap[name.replace(/\.+$/, "")] ?? "0";
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

      firebaseDatabase
        .syncState(listenPrefix, "match", partialData)
        .catch(console.error);
    },
    [isAuthenticated, listenPrefix],
  );

  const getServerTime = useCallback(
    () => Date.now() + serverTimeOffsetRef.current,
    [],
  );

  const startMatch = useCallback(() => {
    applyMatchUpdate((prev) => ({
      ...prev,
      started: getServerTime(),
      countdown: false,
    }));
  }, [applyMatchUpdate, getServerTime]);

  const pauseMatch = useCallback(
    (isHalfEnd?: boolean) => {
      applyMatchUpdate((prev) => {
        const newState: Match = { ...prev, started: 0 };
        if (isHalfEnd) {
          newState.halfOffset = (newState.halfStops[0] ?? 0) * 60 * 1000;
          newState.timeElapsed = 0;
          if (newState.halfStops.length > 1) {
            newState.halfStops = newState.halfStops.slice(1);
          }
        } else if (prev.started && !prev.countdown) {
          newState.timeElapsed =
            prev.timeElapsed + Math.floor(getServerTime() - prev.started);
        }
        return newState;
      });
    },
    [applyMatchUpdate, getServerTime],
  );

  const addGoal = useCallback(
    (team: "home" | "away") => {
      applyMatchUpdate((prev) => {
        const scoreKeys = { home: "homeScore", away: "awayScore" } as const;
        const key = scoreKeys[team];
        return { ...prev, [key]: prev[key] + 1 };
      });
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
      });
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
      });
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
      });
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
      });
    },
    [applyMatchUpdate],
  );

  const setHalfStops = useCallback(
    (halfStops: number[], showInjuryTime: boolean) => {
      applyMatchUpdate((prev) => ({
        ...prev,
        halfStops,
        showInjuryTime: showInjuryTime || false,
      }));
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
      });
    },
    [applyMatchUpdate, getServerTime],
  );

  const removeTimeout = useCallback(() => {
    applyMatchUpdate((prev) => ({ ...prev, timeout: 0 }));
  }, [applyMatchUpdate]);

  const buzz = useCallback(
    (on: boolean) => {
      applyMatchUpdate((prev) => ({
        ...prev,
        buzzer: on ? getServerTime() : false,
      }));
    },
    [applyMatchUpdate, getServerTime],
  );

  const countdown = useCallback(() => {
    applyMatchUpdate((prev) => {
      // Validate HH:mm format to prevent syncing invalid timestamp to Firebase
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
      // Compute how far in the future the match starts using local time
      // (Date.now / moment()), which reflects what the user sees in the UI.
      // Then place "started" in the server-time coordinate system used by
      // Clock.tsx (getServerTime()) so elapsed = getServerTime() - started
      // gives the correct negative countdown value.
      const localNow = moment();
      const momentTime = moment(prev.matchStartTime, "HH:mm");
      if (!momentTime.isValid()) {
        console.warn("countdown() invalid moment from matchStartTime");
        return prev;
      }
      if (momentTime < localNow) {
        momentTime.add(1, "days");
      }
      const duration = momentTime.valueOf() - localNow.valueOf();
      return {
        ...prev,
        started: getServerTime() + duration,
        countdown: true,
      };
    });
  }, [applyMatchUpdate, getServerTime]);

  const updateRedCards = useCallback(
    (home: number, away: number) => {
      applyMatchUpdate((prev) => ({
        ...prev,
        homeRedCards: home,
        awayRedCards: away,
      }));
    },
    [applyMatchUpdate],
  );

  const updateController = useCallback(
    (updates: Partial<ControllerState>) => {
      applyControllerUpdate((prev) => ({
        ...prev,
        ...updates,
      }));
    },
    [applyControllerUpdate],
  );

  const selectView = useCallback(
    (view: string) => {
      applyControllerUpdate((prev) => ({ ...prev, view }));
    },
    [applyControllerUpdate],
  );

  const selectAssetView = useCallback(
    (assetView: string) => {
      applyControllerUpdate((prev) => ({ ...prev, assetView }));
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
          activeQueueId: prev.activeQueueId ?? queueId,
        };
      });
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
      });
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
      });
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
      });
    },
    [applyControllerUpdate],
  );

  const addItemsToQueue = useCallback(
    (queueId: string, assets: Asset[]) => {
      applyControllerUpdate((prev) =>
        getStateWithAddedItems(prev, queueId, assets),
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
      });
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
      });
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
      });
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
      });
    },
    [applyControllerUpdate],
  );

  const stopPlaying = useCallback(() => {
    applyControllerUpdate((prev) => ({ ...prev, playing: false }));
  }, [applyControllerUpdate]);

  const setPlaying = useCallback(
    (playing: boolean) => {
      applyControllerUpdate((prev) => ({ ...prev, playing }));
    },
    [applyControllerUpdate],
  );

  const renderAsset = useCallback(
    (asset: Asset | null) => {
      applyControllerUpdate((prev) => ({
        ...prev,
        currentAsset: asset ? { asset, time: null } : null,
      }));
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
    applyControllerUpdate((prev) => getStateShowingNextAsset(prev));
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
    });
  }, [applyControllerUpdate]);

  const remoteRefresh = useCallback(() => {
    applyControllerUpdate((prev) => ({
      ...prev,
      refreshToken: (Math.random() + 1).toString(36).substring(2),
    }));
  }, [applyControllerUpdate]);

  const setRoster = useCallback(
    (roster: Roster) => {
      applyControllerUpdate((prev) => ({
        ...prev,
        roster,
      }));
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
      });
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
      });
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
      });
    },
    [applyControllerUpdate],
  );

  const clearRoster = useCallback(() => {
    applyControllerUpdate((prev) => ({
      ...prev,
      roster: { home: [], away: [] },
    }));
  }, [applyControllerUpdate]);

  const selectTab = useCallback(
    (tab: string) => {
      applyControllerUpdate((prev) => ({ ...prev, tab }));
    },
    [applyControllerUpdate],
  );

  const updateView = useCallback(
    (updates: Partial<ViewState>) => {
      applyViewUpdate((prev) => ({ ...prev, ...updates }));
    },
    [applyViewUpdate],
  );

  const setViewPort = useCallback(
    (vp: ViewPort) => {
      applyViewUpdate((prev) => ({ ...prev, vp }));
    },
    [applyViewUpdate],
  );

  const setBackground = useCallback(
    (background: string) => {
      applyViewUpdate((prev) => ({ ...prev, background }));
    },
    [applyViewUpdate],
  );

  const setIdleImage = useCallback(
    (idleImage: string) => {
      applyViewUpdate((prev) => ({ ...prev, idleImage }));
    },
    [applyViewUpdate],
  );

  const setBlackoutStart = useCallback(
    (blackoutStart: string | undefined) => {
      applyViewUpdate((prev) => ({ ...prev, blackoutStart }));
    },
    [applyViewUpdate],
  );

  const setBlackoutEnd = useCallback(
    (blackoutEnd: string | undefined) => {
      applyViewUpdate((prev) => ({ ...prev, blackoutEnd }));
    },
    [applyViewUpdate],
  );

  const setTheme = useCallback(
    (theme: ThemeConfig | undefined) => {
      applyViewUpdate((prev) => ({ ...prev, theme }));
    },
    [applyViewUpdate],
  );

  const setThemePreset = useCallback(
    (preset: string | undefined) => {
      applyViewUpdate((prev) => ({ ...prev, themePreset: preset }));
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
      });
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
      });
    },
    [applyViewUpdate],
  );

  // Apply screen viewport override from "Birta skjá" selection.
  // The screenViewport from locations.X.screens[Y] takes precedence over
  // the Firebase view.vp, which may not match the physical screen config.
  const effectiveView = useMemo<ViewState>(() => {
    if (!screenViewport) return view;
    return { ...view, vp: screenViewport };
  }, [view, screenViewport]);

  const value = useMemo(
    () => ({
      match,
      controller,
      view: effectiveView,
      listeners,
      ready,
      updateMatch,
      startMatch,
      pauseMatch,
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
      setBlackoutStart,
      setBlackoutEnd,
      setTheme,
      setThemePreset,
      saveCustomPreset,
      deleteCustomPreset,
    }),
    [
      match,
      controller,
      effectiveView,
      listeners,
      ready,
      updateMatch,
      startMatch,
      pauseMatch,
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
      setBlackoutStart,
      setBlackoutEnd,
      setTheme,
      setThemePreset,
      saveCustomPreset,
      deleteCustomPreset,
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
    updateRedCards,
    getServerTime,
  } = useFirebaseState();
  return {
    match,
    updateMatch,
    startMatch,
    pauseMatch,
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
    setBlackoutStart,
    setBlackoutEnd,
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
    setBlackoutStart,
    setBlackoutEnd,
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
