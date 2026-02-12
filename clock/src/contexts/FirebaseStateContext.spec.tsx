import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import {
  FirebaseStateProvider,
  useMatch,
  useController,
  useView,
} from "./FirebaseStateContext";
import { Asset, AvailableMatches, ViewPort } from "../types";
import { Sports, DEFAULT_HALFSTOPS } from "../constants";

import { firebaseDatabase } from "../firebaseDatabase";

vi.mock("../firebaseDatabase", () => ({
  firebaseDatabase: {
    syncState: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../firebase", () => ({
  database: {},
}));

vi.mock("firebase/database", () => ({
  ref: vi.fn(),
  onValue: vi.fn(() => vi.fn()),
}));

const TestMatchConsumer = ({
  onMount,
}: {
  onMount: (api: ReturnType<typeof useMatch>) => void;
}) => {
  const matchApi = useMatch();
  React.useEffect(() => {
    onMount(matchApi);
  }, [matchApi, onMount]);
  return (
    <div data-testid="match-consumer">Score: {matchApi.match.homeScore}</div>
  );
};

const TestControllerConsumer = ({
  onMount,
}: {
  onMount: (api: ReturnType<typeof useController>) => void;
}) => {
  const controllerApi = useController();
  React.useEffect(() => {
    onMount(controllerApi);
  }, [controllerApi, onMount]);
  return (
    <div data-testid="controller-consumer">
      View: {controllerApi.controller.view}
    </div>
  );
};

const TestViewConsumer = ({
  onMount,
}: {
  onMount: (api: ReturnType<typeof useView>) => void;
}) => {
  const viewApi = useView();
  React.useEffect(() => {
    onMount(viewApi);
  }, [viewApi, onMount]);
  return (
    <div data-testid="view-consumer">Background: {viewApi.view.background}</div>
  );
};

describe("FirebaseStateContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("empty listenPrefix protection", () => {
    it("blocks match updates when listenPrefix is empty", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;

      render(
        <FirebaseStateProvider listenPrefix="" isAuthenticated={true}>
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );

      expect(matchApi).not.toBeNull();
      expect(matchApi!.match.homeScore).toBe(0);

      act(() => {
        matchApi!.addGoal("home");
      });

      expect(firebaseDatabase.syncState).not.toHaveBeenCalled();
    });

    it("blocks controller updates when listenPrefix is empty", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;

      render(
        <FirebaseStateProvider listenPrefix="" isAuthenticated={true}>
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );

      expect(controllerApi).not.toBeNull();
      expect(controllerApi!.controller.view).toBe("idle");

      act(() => {
        controllerApi!.selectView("scoreboard");
      });

      expect(firebaseDatabase.syncState).not.toHaveBeenCalled();
    });
  });

  describe("authenticated mode", () => {
    it("syncs match updates when listenPrefix is set and authenticated", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;

      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );

      expect(matchApi).not.toBeNull();

      act(() => {
        matchApi!.addGoal("home");
      });

      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ homeScore: 1 }),
      );
    });

    it("allows rapid sequential goal additions (updates ref immediately)", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;

      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );

      act(() => {
        matchApi!.addGoal("home");
      });
      act(() => {
        matchApi!.addGoal("home");
      });
      act(() => {
        matchApi!.addGoal("away");
      });

      expect(firebaseDatabase.syncState).toHaveBeenNthCalledWith(
        1,
        "test-location",
        "match",
        expect.objectContaining({ homeScore: 1 }),
      );
      expect(firebaseDatabase.syncState).toHaveBeenNthCalledWith(
        2,
        "test-location",
        "match",
        expect.objectContaining({ homeScore: 2 }),
      );
      expect(firebaseDatabase.syncState).toHaveBeenNthCalledWith(
        3,
        "test-location",
        "match",
        expect.objectContaining({ homeScore: 2, awayScore: 1 }),
      );
    });

    it("syncs controller view changes", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;

      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );

      act(() => {
        controllerApi!.selectView("scoreboard");
      });

      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ view: "scoreboard" }),
      );
    });
  });

  describe("default state", () => {
    it("initializes with default match state", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;

      render(
        <FirebaseStateProvider listenPrefix="test" isAuthenticated={false}>
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );

      expect(matchApi!.match.homeScore).toBe(0);
      expect(matchApi!.match.awayScore).toBe(0);
      expect(matchApi!.match.started).toBe(0);
      expect(matchApi!.match.homeTeam).toBe("Vikingur R");
    });

    it("initializes with default controller state", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;

      render(
        <FirebaseStateProvider listenPrefix="test" isAuthenticated={false}>
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );

      expect(controllerApi!.controller.view).toBe("idle");
      expect(controllerApi!.controller.selectedAssets).toEqual([]);
      expect(controllerApi!.controller.cycle).toBe(false);
    });
  });

  describe("match actions", () => {
    it("startMatch sets started timestamp and clears countdown", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.startMatch();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          started: expect.any(Number) as unknown,
          countdown: false,
        }),
      );
    });

    it("pauseMatch sets started to 0", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.pauseMatch();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ started: 0 }),
      );
    });

    it("addGoal increments homeScore", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.addGoal("home");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ homeScore: 1 }),
      );
    });

    it("addGoal increments awayScore", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.addGoal("away");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ awayScore: 1 }),
      );
    });

    it("buzz(true) sets buzzer to timestamp", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.buzz(true);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ buzzer: expect.any(Number) as unknown }),
      );
    });

    it("buzz(false) sets buzzer to false", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.buzz(false);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ buzzer: false }),
      );
    });

    it("setHalfStops updates halfStops and showInjuryTime", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.setHalfStops([30, 60], true);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ halfStops: [30, 60], showInjuryTime: true }),
      );
    });

    it("matchTimeout sets timeout timestamp and increments team timeouts", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.matchTimeout("home");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          timeout: expect.any(Number) as unknown,
          homeTimeouts: 1,
        }),
      );
    });

    it("removeTimeout clears timeout", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.removeTimeout();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ timeout: 0 }),
      );
    });

    it("updateRedCards sets home and away red cards", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateRedCards(2, 1);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ homeRedCards: 2, awayRedCards: 1 }),
      );
    });

    it("addPenalty adds penalty to team", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.addPenalty("home", "pen-1", 120);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          home2min: expect.arrayContaining([
            expect.objectContaining({ key: "pen-1", penaltyLength: 120 }),
          ]) as unknown,
        }),
      );
    });

    it("removePenalty removes penalty by key", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      // First add a penalty
      act(() => {
        matchApi!.addPenalty("home", "pen-1", 120);
      });
      vi.clearAllMocks();
      // Then remove it
      act(() => {
        matchApi!.removePenalty("pen-1");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ home2min: [], away2min: [] }),
      );
    });
  });

  describe("controller actions", () => {
    it("selectAssetView updates assetView", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.selectAssetView("teams");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ assetView: "teams" }),
      );
    });

    it("toggleCycle toggles cycle boolean", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.toggleCycle();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ cycle: true }),
      );
    });

    it("setImageSeconds updates imageSeconds", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.setImageSeconds(10);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ imageSeconds: 10 }),
      );
    });

    it("toggleAutoPlay toggles autoPlay", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.toggleAutoPlay();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ autoPlay: true }),
      );
    });

    it("setPlaying updates playing state", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.setPlaying(true);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ playing: true }),
      );
    });

    it("renderAsset sets currentAsset", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      const asset = { type: "image", key: "asset-1" };
      act(() => {
        controllerApi!.renderAsset(asset as unknown as Asset);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          currentAsset: expect.objectContaining({
            asset,
          }) as unknown,
        }),
      );
    });

    it("renderAsset(null) clears currentAsset", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.renderAsset(null);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ currentAsset: null }),
      );
    });

    it("setSelectedAssets sets assets array", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      const assets = [{ type: "image", key: "a1" }];
      act(() => {
        controllerApi!.setSelectedAssets(assets as unknown as Asset[]);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ selectedAssets: assets }),
      );
    });

    it("selectTab updates tab", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.selectTab("settings");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ tab: "settings" }),
      );
    });

    it("remoteRefresh sets new refreshToken", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.remoteRefresh();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          refreshToken: expect.any(String) as unknown,
        }),
      );
    });

    it("clearMatchPlayers clears availableMatches and selectedMatch", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.clearMatchPlayers();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ availableMatches: {}, selectedMatch: null }),
      );
    });
  });

  describe("updateMatch", () => {
    it("looks up homeTeamId from club-ids", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateMatch({ homeTeam: "Valur" });
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ homeTeam: "Valur", homeTeamId: 101 }),
      );
    });

    it("looks up awayTeamId from club-ids", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateMatch({ awayTeam: "KR" });
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ awayTeam: "KR", awayTeamId: 107 }),
      );
    });

    it("sets teamId to 0 for unknown team", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateMatch({ awayTeam: "Unknown FC" });
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ awayTeam: "Unknown FC", awayTeamId: 0 }),
      );
    });

    it("sets awayTeamId to 0 for empty awayTeam", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateMatch({ awayTeam: "" });
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ awayTeam: "", awayTeamId: 0 }),
      );
    });

    it("resets NaN injuryTime to 0", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateMatch({ injuryTime: NaN });
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ injuryTime: 0 }),
      );
    });

    it("resets invalid matchType to Football", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateMatch({
          matchType: "basketball" as unknown as Sports,
        });
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ matchType: Sports.Football }),
      );
    });

    it("updates halfStops when matchType changes", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateMatch({ matchType: Sports.Handball });
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          matchType: Sports.Handball,
          halfStops: DEFAULT_HALFSTOPS[Sports.Handball],
        }),
      );
    });

    it("clears buzzer when started transitions from 0 to truthy", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.buzz(true);
      });
      vi.clearAllMocks();
      act(() => {
        matchApi!.updateMatch({ started: Date.now() });
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ buzzer: false }),
      );
    });
  });

  describe("pauseMatch with isHalfEnd", () => {
    it("sets timeElapsed to first halfStop and slices halfStops", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.startMatch();
      });
      vi.clearAllMocks();
      act(() => {
        matchApi!.pauseMatch(true);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          started: 0,
          timeElapsed: 45 * 60 * 1000,
          halfStops: [90, 105, 120],
        }),
      );
    });

    it("accumulates timeElapsed on normal pause", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.startMatch();
      });
      vi.clearAllMocks();
      act(() => {
        matchApi!.pauseMatch();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          started: 0,
          timeElapsed: expect.any(Number) as unknown,
        }),
      );
    });
  });

  describe("countdown", () => {
    it("does not change state when matchStartTime is not set", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.countdown();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ countdown: false, started: 0 }),
      );
    });

    it("does not change state when matchStartTime is invalid format", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateMatch({ matchStartTime: "not-a-time" });
      });
      vi.clearAllMocks();
      act(() => {
        matchApi!.countdown();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ countdown: false, started: 0 }),
      );
    });

    it("sets started and countdown=true for valid matchStartTime", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateMatch({ matchStartTime: "23:59" });
      });
      vi.clearAllMocks();
      act(() => {
        matchApi!.countdown();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          started: expect.any(Number) as unknown,
          countdown: true,
        }),
      );
    });
  });

  describe("addAssets", () => {
    it("adds valid assets to selectedAssets", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      const assets: Asset[] = [
        { type: "IMAGE", key: "img-1" },
        { type: "VIDEO", key: "vid-1" },
      ];
      act(() => {
        controllerApi!.addAssets(assets);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          selectedAssets: [
            { type: "IMAGE", key: "img-1" },
            { type: "VIDEO", key: "vid-1" },
          ],
        }),
      );
    });

    it("deduplicates assets with same key", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.addAssets([{ type: "IMAGE", key: "img-1" }]);
      });
      vi.clearAllMocks();
      act(() => {
        controllerApi!.addAssets([{ type: "IMAGE", key: "img-1" }]);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          selectedAssets: [{ type: "IMAGE", key: "img-1" }],
        }),
      );
    });

    it("filters out assets with invalid type", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.addAssets([
          { type: "INVALID_TYPE", key: "bad-1" },
          { type: "IMAGE", key: "good-1" },
        ]);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          selectedAssets: [{ type: "IMAGE", key: "good-1" }],
        }),
      );
    });

    it("filters out assets with empty key", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.addAssets([{ type: "IMAGE", key: "" }]);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ selectedAssets: [] }),
      );
    });
  });

  describe("removeAsset", () => {
    it("removes asset by key", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.addAssets([
          { type: "IMAGE", key: "img-1" },
          { type: "IMAGE", key: "img-2" },
        ]);
      });
      vi.clearAllMocks();
      act(() => {
        controllerApi!.removeAsset({ type: "IMAGE", key: "img-1" });
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          selectedAssets: [{ type: "IMAGE", key: "img-2" }],
        }),
      );
    });

    it("returns unchanged state when removing non-existent asset", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.removeAsset({ type: "IMAGE", key: "nonexistent" });
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ selectedAssets: [] }),
      );
    });
  });

  describe("showNextAsset", () => {
    it("shifts next asset from queue to currentAsset", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.setSelectedAssets([
          { type: "IMAGE", key: "img-1" },
          { type: "IMAGE", key: "img-2" },
        ]);
      });
      vi.clearAllMocks();
      act(() => {
        controllerApi!.showNextAsset();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          currentAsset: expect.objectContaining({
            asset: { type: "IMAGE", key: "img-1" },
            time: null,
          }) as unknown,
          selectedAssets: [{ type: "IMAGE", key: "img-2" }],
        }),
      );
    });

    it("clears currentAsset and stops playing when queue is empty", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.showNextAsset();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ currentAsset: null, playing: false }),
      );
    });

    it("cycles asset to end of queue when cycle is enabled", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.toggleCycle();
      });
      act(() => {
        controllerApi!.setSelectedAssets([
          { type: "IMAGE", key: "img-1" },
          { type: "IMAGE", key: "img-2" },
        ]);
      });
      vi.clearAllMocks();
      act(() => {
        controllerApi!.showNextAsset();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          currentAsset: expect.objectContaining({
            asset: { type: "IMAGE", key: "img-1" },
          }) as unknown,
          selectedAssets: [
            { type: "IMAGE", key: "img-2" },
            { type: "IMAGE", key: "img-1" },
          ],
        }),
      );
    });

    it("sets time from imageSeconds when autoPlay is enabled", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.toggleAutoPlay();
      });
      act(() => {
        controllerApi!.setImageSeconds(5);
      });
      act(() => {
        controllerApi!.setSelectedAssets([{ type: "IMAGE", key: "img-1" }]);
      });
      vi.clearAllMocks();
      act(() => {
        controllerApi!.showNextAsset();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          currentAsset: expect.objectContaining({
            asset: { type: "IMAGE", key: "img-1" },
            time: 5,
          }) as unknown,
          playing: true,
        }),
      );
    });
  });

  describe("removeAssetAfterTimeout", () => {
    it("clears currentAsset when autoPlay is off", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.renderAsset({ type: "IMAGE", key: "img-1" });
      });
      vi.clearAllMocks();
      act(() => {
        controllerApi!.removeAssetAfterTimeout();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ currentAsset: null }),
      );
    });

    it("shows next asset when autoPlay is on and playing", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.toggleAutoPlay();
      });
      act(() => {
        controllerApi!.setPlaying(true);
      });
      act(() => {
        controllerApi!.setSelectedAssets([{ type: "IMAGE", key: "img-2" }]);
      });
      vi.clearAllMocks();
      act(() => {
        controllerApi!.removeAssetAfterTimeout();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          currentAsset: expect.objectContaining({
            asset: { type: "IMAGE", key: "img-2" },
          }) as unknown,
        }),
      );
    });

    it("does nothing when autoPlay is on but not playing", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.toggleAutoPlay();
      });
      vi.clearAllMocks();
      act(() => {
        controllerApi!.removeAssetAfterTimeout();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ autoPlay: true, playing: false }),
      );
    });
  });

  describe("player CRUD", () => {
    const setupWithMatch = () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      const availableMatches: AvailableMatches = {
        "123": {
          group: "Premier",
          players: {
            home: [
              { name: "Player A", number: "10", show: true, role: "FW" },
              { name: "Player B", number: "7", show: true, role: "MF" },
            ],
            away: [{ name: "Player C", number: "1", show: true, role: "GK" }],
          },
        },
      };
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.setAvailableMatches(availableMatches);
      });
      vi.clearAllMocks();
      return controllerApi!;
    };

    it("editPlayer updates a player field at index", () => {
      const api = setupWithMatch();
      act(() => {
        api.editPlayer("home", 0, { name: "Updated Player" });
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          availableMatches: expect.objectContaining({
            "123": expect.objectContaining({
              players: expect.objectContaining({
                home: expect.arrayContaining([
                  expect.objectContaining({ name: "Updated Player" }),
                ]) as unknown,
              }) as unknown,
            }) as unknown,
          }) as unknown,
        }),
      );
    });

    it("editPlayer does nothing when selectedMatch is null", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.editPlayer("home", 0, { name: "Test" });
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ selectedMatch: null }),
      );
    });

    it("editPlayer does nothing for invalid player index", () => {
      const api = setupWithMatch();
      act(() => {
        api.editPlayer("home", 99, { name: "Ghost" });
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          availableMatches: expect.objectContaining({
            "123": expect.objectContaining({
              players: expect.objectContaining({
                home: [
                  expect.objectContaining({ name: "Player A" }),
                  expect.objectContaining({ name: "Player B" }),
                ],
              }) as unknown,
            }) as unknown,
          }) as unknown,
        }),
      );
    });

    it("deletePlayer removes player at index", () => {
      const api = setupWithMatch();
      act(() => {
        api.deletePlayer("home", 0);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          availableMatches: expect.objectContaining({
            "123": expect.objectContaining({
              players: expect.objectContaining({
                home: [
                  expect.objectContaining({ name: "Player B", number: "7" }),
                ],
              }) as unknown,
            }) as unknown,
          }) as unknown,
        }),
      );
    });

    it("deletePlayer does nothing for non-existent teamId", () => {
      const api = setupWithMatch();
      act(() => {
        api.deletePlayer("nonexistent", 0);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          availableMatches: expect.objectContaining({
            "123": expect.objectContaining({
              players: expect.objectContaining({
                home: expect.arrayContaining([
                  expect.objectContaining({ name: "Player A" }),
                ]) as unknown,
              }) as unknown,
            }) as unknown,
          }) as unknown,
        }),
      );
    });

    it("addPlayer adds empty player to existing team", () => {
      const api = setupWithMatch();
      act(() => {
        api.addPlayer("home");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          availableMatches: expect.objectContaining({
            "123": expect.objectContaining({
              players: expect.objectContaining({
                home: expect.arrayContaining([
                  expect.objectContaining({
                    name: "",
                    number: "",
                    show: false,
                    role: "",
                  }),
                ]) as unknown,
              }) as unknown,
            }) as unknown,
          }) as unknown,
        }),
      );
    });

    it("addPlayer creates team array if it does not exist", () => {
      const api = setupWithMatch();
      act(() => {
        api.addPlayer("newteam");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          availableMatches: expect.objectContaining({
            "123": expect.objectContaining({
              players: expect.objectContaining({
                newteam: [{ name: "", number: "", show: false, role: "" }],
              }) as unknown,
            }) as unknown,
          }) as unknown,
        }),
      );
    });
  });

  describe("view actions", () => {
    it("setViewPort updates viewport", () => {
      let viewApi: ReturnType<typeof useView> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestViewConsumer
            onMount={(api) => {
              viewApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      const newVp: ViewPort = {
        style: { height: 720, width: 1280 },
        name: "720p",
        key: "custom",
      };
      act(() => {
        viewApi!.setViewPort(newVp);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "view",
        expect.objectContaining({ vp: newVp }),
      );
    });

    it("setBackground updates background", () => {
      let viewApi: ReturnType<typeof useView> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestViewConsumer
            onMount={(api) => {
              viewApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        viewApi!.setBackground("Svart");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "view",
        expect.objectContaining({ background: "Svart" }),
      );
    });

    it("setIdleImage updates idleImage", () => {
      let viewApi: ReturnType<typeof useView> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestViewConsumer
            onMount={(api) => {
              viewApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        viewApi!.setIdleImage("https://example.com/logo.png");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "view",
        expect.objectContaining({
          idleImage: "https://example.com/logo.png",
        }),
      );
    });

    it("updateView merges partial view updates", () => {
      let viewApi: ReturnType<typeof useView> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestViewConsumer
            onMount={(api) => {
              viewApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        viewApi!.updateView({ background: "Ekkert" });
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "view",
        expect.objectContaining({ background: "Ekkert" }),
      );
    });
  });

  describe("additional match actions", () => {
    it("addToPenalty increases penaltyLength for matching key", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.addPenalty("home", "pen-1", 120);
      });
      vi.clearAllMocks();
      act(() => {
        matchApi!.addToPenalty("pen-1", 60);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          home2min: expect.arrayContaining([
            expect.objectContaining({ key: "pen-1", penaltyLength: 180 }),
          ]) as unknown,
        }),
      );
    });

    it("updateHalfLength replaces matching half stop value", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateHalfLength("45", "50");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ halfStops: [50, 90, 105, 120] }),
      );
    });

    it("updateHalfLength returns unchanged state for invalid new value", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateHalfLength("45", "abc");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ halfStops: [45, 90, 105, 120] }),
      );
    });

    it("updateHalfLength treats empty string as 0", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateHalfLength("45", "");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ halfStops: [0, 90, 105, 120] }),
      );
    });

    it("updateHalfLength returns unchanged state for negative values", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateHalfLength("45", "-5");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ halfStops: [45, 90, 105, 120] }),
      );
    });

    it("matchTimeout caps at 4 timeouts", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      for (let i = 0; i < 5; i++) {
        act(() => {
          matchApi!.matchTimeout("away");
        });
      }
      expect(firebaseDatabase.syncState).toHaveBeenLastCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ awayTimeouts: 4 }),
      );
    });
  });

  describe("additional controller actions", () => {
    it("selectMatch stores matchId for valid numeric string", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.selectMatch("456");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ selectedMatch: "456" }),
      );
    });

    it("selectMatch ignores non-numeric matchId", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.selectMatch("not-a-number");
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ selectedMatch: null }),
      );
    });

    it("setAvailableMatches sets matches and selects first key", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      const matches: AvailableMatches = {
        "100": { players: {} },
        "200": { players: {} },
      };
      act(() => {
        controllerApi!.setAvailableMatches(matches);
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          availableMatches: matches,
          selectedMatch: "100",
        }),
      );
    });

    it("updateController merges updates and defaults selectedAssets to empty", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.updateController({ view: "match" });
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ view: "match", selectedAssets: [] }),
      );
    });

    it("toggleAutoPlay turns off playing when disabling autoPlay", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.toggleAutoPlay();
      });
      act(() => {
        controllerApi!.setPlaying(true);
      });
      vi.clearAllMocks();
      act(() => {
        controllerApi!.toggleAutoPlay();
      });
      expect(firebaseDatabase.syncState).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ autoPlay: false, playing: false }),
      );
    });
  });
});
