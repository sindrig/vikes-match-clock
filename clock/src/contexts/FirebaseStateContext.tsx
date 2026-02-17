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
  Asset,
  Player,
  AvailableMatches,
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
};

const defaultController: ControllerState = {
  selectedAssets: [],
  cycle: false,
  imageSeconds: 3,
  autoPlay: false,
  playing: false,
  assetView: "assets",
  view: "idle",
  availableMatches: {},
  selectedMatch: null,
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
  updateHalfLength: (currentValue: string, newValue: string) => void;
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
  setSelectedAssets: (assets: Asset[]) => void;
  addAssets: (assets: Asset[]) => void;
  removeAsset: (asset: Asset) => void;
  toggleCycle: () => void;
  setImageSeconds: (seconds: number) => void;
  toggleAutoPlay: () => void;
  setPlaying: (playing: boolean) => void;
  renderAsset: (asset: Asset | null) => void;
  showNextAsset: () => void;
  removeAssetAfterTimeout: () => void;
  remoteRefresh: () => void;
  setAvailableMatches: (matches: AvailableMatches) => void;
  selectMatch: (matchId: string) => void;
  editPlayer: (
    teamId: string,
    idx: number,
    updatedPlayer: Partial<Player>,
  ) => void;
  deletePlayer: (teamId: string, idx: number) => void;
  addPlayer: (teamId: string) => void;
  clearMatchPlayers: () => void;
  selectTab: (tab: string) => void;

  updateView: (updates: Partial<ViewState>) => void;
  setViewPort: (vp: ViewPort) => void;
  setBackground: (background: string) => void;
  setIdleImage: (idleImage: string) => void;
}

const FirebaseStateContext = createContext<FirebaseStateContextType | null>(
  null,
);

const getStateShowingNextAsset = (state: ControllerState): ControllerState => {
  const { cycle, selectedAssets, imageSeconds, autoPlay } = state;
  const newState = { ...state };
  if (!selectedAssets.length) {
    newState.playing = false;
    newState.currentAsset = null;
  } else {
    const assets = [...selectedAssets];
    const nextAsset = assets.shift();
    if (!nextAsset) {
      newState.playing = false;
      newState.currentAsset = null;
      return newState;
    }
    newState.currentAsset = {
      asset: nextAsset,
      time: autoPlay ? imageSeconds : null,
    };
    if (autoPlay) {
      newState.playing = true;
    }
    if (cycle) {
      newState.selectedAssets = [...assets, nextAsset];
    } else {
      newState.selectedAssets = [...assets];
    }
  }
  return newState;
};

interface FirebaseStateProviderProps {
  children: ReactNode;
  listenPrefix: string;
  isAuthenticated: boolean;
}

export const FirebaseStateProvider: React.FC<FirebaseStateProviderProps> = ({
  children,
  listenPrefix,
  isAuthenticated,
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
            .syncPartialState(listenPrefix, "match", diff)
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

        const diff: Record<string, unknown> = {};
        for (const key of Object.keys(newState) as (keyof ControllerState)[]) {
          const oldVal = prev[key];
          const newVal = newState[key];
          if (oldVal !== newVal) {
            diff[key] = newVal;
          }
        }

        if (Object.keys(diff).length > 0) {
          firebaseDatabase
            .syncPartialState(listenPrefix, "controller", diff)
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
            diff[key] = newVal;
          }
        }

        if (Object.keys(diff).length > 0) {
          firebaseDatabase
            .syncPartialState(listenPrefix, "view", diff)
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
      newState.homeTeamId = newState.homeTeam
        ? parseInt(clubIdsMap[newState.homeTeam] || "0", 10)
        : 0;
      newState.awayTeamId = newState.awayTeam
        ? parseInt(clubIdsMap[newState.awayTeam] || "0", 10)
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
        .syncPartialState(listenPrefix, "match", partialData)
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
          newState.timeElapsed = (newState.halfStops[0] ?? 0) * 60 * 1000;
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
      applyMatchUpdate((prev) => ({
        ...prev,
        home2min: prev.home2min.filter((t) => t.key !== key),
        away2min: prev.away2min.filter((t) => t.key !== key),
      }));
    },
    [applyMatchUpdate],
  );

  const addToPenalty = useCallback(
    (key: string, toAdd: number) => {
      applyMatchUpdate((prev) => ({
        ...prev,
        home2min: prev.home2min.map((t) =>
          t.key === key
            ? { ...t, penaltyLength: Number(t.penaltyLength) + Number(toAdd) }
            : t,
        ),
        away2min: prev.away2min.map((t) =>
          t.key === key
            ? { ...t, penaltyLength: Number(t.penaltyLength) + Number(toAdd) }
            : t,
        ),
      }));
    },
    [applyMatchUpdate],
  );

  const updateHalfLength = useCallback(
    (currentValue: string, newValue: string) => {
      applyMatchUpdate((prev) => {
        const currentValueParsed = parseInt(currentValue, 10);
        const newValueParsed = newValue === "" ? 0 : parseInt(newValue, 10);
        if (Number.isNaN(newValueParsed) || newValueParsed < 0) {
          return prev;
        }
        return {
          ...prev,
          halfStops: prev.halfStops.map((v) =>
            v === currentValueParsed ? newValueParsed : v,
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
        selectedAssets: [],
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

  const setSelectedAssets = useCallback(
    (assets: Asset[]) => {
      applyControllerUpdate((prev) => ({
        ...prev,
        selectedAssets: assets || [],
      }));
    },
    [applyControllerUpdate],
  );

  const addAssets = useCallback(
    (assets: Asset[]) => {
      applyControllerUpdate((prev) => {
        const updatedAssets = [...(prev.selectedAssets || [])];
        assets.forEach((asset) => {
          if (Object.keys(assetTypes).indexOf(asset.type) !== -1 && asset.key) {
            if (updatedAssets.map((s) => s.key).indexOf(asset.key) === -1) {
              updatedAssets.push(asset);
            }
          }
        });
        return { ...prev, selectedAssets: updatedAssets };
      });
    },
    [applyControllerUpdate],
  );

  const removeAsset = useCallback(
    (asset: Asset) => {
      applyControllerUpdate((prev) => {
        const idx = prev.selectedAssets.map((a) => a.key).indexOf(asset.key);
        if (idx > -1) {
          const newAssets = [...prev.selectedAssets];
          newAssets.splice(idx, 1);
          return { ...prev, selectedAssets: newAssets };
        }
        return prev;
      });
    },
    [applyControllerUpdate],
  );

  const toggleCycle = useCallback(() => {
    applyControllerUpdate((prev) => ({ ...prev, cycle: !prev.cycle }));
  }, [applyControllerUpdate]);

  const setImageSeconds = useCallback(
    (seconds: number) => {
      applyControllerUpdate((prev) => ({ ...prev, imageSeconds: seconds }));
    },
    [applyControllerUpdate],
  );

  const toggleAutoPlay = useCallback(() => {
    applyControllerUpdate((prev) => ({
      ...prev,
      autoPlay: !prev.autoPlay,
      playing: prev.autoPlay ? false : prev.playing,
    }));
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

  const showNextAsset = useCallback(() => {
    applyControllerUpdate((prev) => getStateShowingNextAsset(prev));
  }, [applyControllerUpdate]);

  const removeAssetAfterTimeout = useCallback(() => {
    applyControllerUpdate((prev) => {
      const { playing, autoPlay } = prev;
      if (autoPlay) {
        if (playing) {
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

  const setAvailableMatches = useCallback(
    (matches: AvailableMatches) => {
      applyControllerUpdate((prev) => ({
        ...prev,
        availableMatches: matches || {},
        selectedMatch: Object.keys(matches || {})[0] || null,
      }));
    },
    [applyControllerUpdate],
  );

  const selectMatch = useCallback(
    (matchId: string) => {
      applyControllerUpdate((prev) => {
        const selectedMatch = parseInt(matchId, 10);
        if (!isNaN(selectedMatch)) {
          return { ...prev, selectedMatch: matchId };
        }
        return prev;
      });
    },
    [applyControllerUpdate],
  );

  const editPlayer = useCallback(
    (teamId: string, idx: number, updatedPlayer: Partial<Player>) => {
      applyControllerUpdate((prev) => {
        const { availableMatches, selectedMatch } = prev;
        if (!selectedMatch || !availableMatches[selectedMatch]) return prev;
        const match = structuredClone(availableMatches[selectedMatch]);
        const players = match.players[teamId];
        if (!players || !players[idx]) return prev;
        players[idx] = {
          ...players[idx],
          ...updatedPlayer,
        };
        return {
          ...prev,
          availableMatches: {
            ...availableMatches,
            [selectedMatch]: match,
          },
        };
      });
    },
    [applyControllerUpdate],
  );

  const deletePlayer = useCallback(
    (teamId: string, idx: number) => {
      applyControllerUpdate((prev) => {
        const { availableMatches, selectedMatch } = prev;
        if (!selectedMatch || !availableMatches[selectedMatch]) return prev;
        const match = structuredClone(availableMatches[selectedMatch]);
        const players = match.players[teamId];
        if (!players) return prev;
        match.players[teamId] = players.filter(
          (_: Player, i: number) => i !== idx,
        );
        return {
          ...prev,
          availableMatches: {
            ...availableMatches,
            [selectedMatch]: match,
          },
        };
      });
    },
    [applyControllerUpdate],
  );

  const addPlayer = useCallback(
    (teamId: string) => {
      applyControllerUpdate((prev) => {
        const { availableMatches, selectedMatch } = prev;
        if (!selectedMatch || !availableMatches[selectedMatch]) return prev;
        const match = structuredClone(availableMatches[selectedMatch]);
        if (!match.players[teamId]) {
          match.players[teamId] = [];
        }
        match.players[teamId].push({
          name: "",
          number: "",
          show: false,
          role: "",
        });
        return {
          ...prev,
          availableMatches: {
            ...availableMatches,
            [selectedMatch]: match,
          },
        };
      });
    },
    [applyControllerUpdate],
  );

  const clearMatchPlayers = useCallback(() => {
    applyControllerUpdate((prev) => ({
      ...prev,
      availableMatches: {},
      selectedMatch: null,
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

  const value = useMemo(
    () => ({
      match,
      controller,
      view,
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
      setSelectedAssets,
      addAssets,
      removeAsset,
      toggleCycle,
      setImageSeconds,
      toggleAutoPlay,
      setPlaying,
      renderAsset,
      showNextAsset,
      removeAssetAfterTimeout,
      remoteRefresh,
      setAvailableMatches,
      selectMatch,
      editPlayer,
      deletePlayer,
      addPlayer,
      clearMatchPlayers,
      selectTab,
      updateView,
      setViewPort,
      setBackground,
      setIdleImage,
    }),
    [
      match,
      controller,
      view,
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
      setSelectedAssets,
      addAssets,
      removeAsset,
      toggleCycle,
      setImageSeconds,
      toggleAutoPlay,
      setPlaying,
      renderAsset,
      showNextAsset,
      removeAssetAfterTimeout,
      remoteRefresh,
      setAvailableMatches,
      selectMatch,
      editPlayer,
      deletePlayer,
      addPlayer,
      clearMatchPlayers,
      selectTab,
      updateView,
      setViewPort,
      setBackground,
      setIdleImage,
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
    setSelectedAssets,
    addAssets,
    removeAsset,
    toggleCycle,
    setImageSeconds,
    toggleAutoPlay,
    setPlaying,
    renderAsset,
    showNextAsset,
    removeAssetAfterTimeout,
    remoteRefresh,
    setAvailableMatches,
    selectMatch,
    editPlayer,
    deletePlayer,
    addPlayer,
    clearMatchPlayers,
    selectTab,
  } = useFirebaseState();
  return {
    controller,
    updateController,
    selectView,
    selectAssetView,
    setSelectedAssets,
    addAssets,
    removeAsset,
    toggleCycle,
    setImageSeconds,
    toggleAutoPlay,
    setPlaying,
    renderAsset,
    showNextAsset,
    removeAssetAfterTimeout,
    remoteRefresh,
    setAvailableMatches,
    selectMatch,
    editPlayer,
    deletePlayer,
    addPlayer,
    clearMatchPlayers,
    selectTab,
  };
};

export const useView = () => {
  const { view, updateView, setViewPort, setBackground, setIdleImage } =
    useFirebaseState();
  return { view, updateView, setViewPort, setBackground, setIdleImage };
};

export const useListeners = () => {
  const { listeners } = useFirebaseState();
  return listeners;
};
