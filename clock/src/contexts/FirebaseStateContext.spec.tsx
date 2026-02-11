import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import {
  FirebaseStateProvider,
  useMatch,
  useController,
} from "./FirebaseStateContext";
import { Asset } from "../types";

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
          expect.objectContaining({ refreshToken: expect.any(String) as unknown }),
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
});
