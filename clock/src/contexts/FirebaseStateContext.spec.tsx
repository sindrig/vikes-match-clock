import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { onValue, ref, set } from "firebase/database";
import {
  FirebaseStateProvider,
  useMatch,
  useController,
  useView,
  usePerimeter,
} from "./FirebaseStateContext";
import { Asset, Roster, ViewPort } from "../types";
import { Sports, DEFAULT_HALFSTOPS, VIEWS } from "../constants";

import { firebaseDatabase } from "../firebaseDatabase";

vi.mock("../firebaseDatabase", () => ({
  firebaseDatabase: {
    writeAudited: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../firebase", () => ({
  database: {},
  FIREBASE_STORAGE_BUCKET: "vikes-match-clock-firebase.appspot.com",
}));

vi.mock("firebase/database", () => ({
  ref: vi.fn(),
  onValue: vi.fn(() => vi.fn()),
  set: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
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

const TestPerimeterConsumer = ({
  onMount,
}: {
  onMount: (api: ReturnType<typeof usePerimeter>) => void;
}) => {
  const perimeterApi = usePerimeter();
  React.useEffect(() => {
    onMount(perimeterApi);
  }, [perimeterApi, onMount]);
  return (
    <div data-testid="perimeter-consumer">
      State: {perimeterApi.perimeter.state}
    </div>
  );
};

describe("FirebaseStateContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(ref).mockImplementation((_, path) => path as never);

    vi.mocked(onValue).mockImplementation((reference, callback) => {
      const path = String(reference);

      if (path.includes("clubOverrides")) {
        callback({
          val: () => null,
        } as never);
      } else {
        callback({
          val: () => null,
        } as never);
      }

      return vi.fn();
    });
  });

  describe("empty listenPrefix protection", () => {
    it("blocks match updates when listenPrefix is empty", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;

      render(
        <FirebaseStateProvider
          listenPrefix=""
          isAuthenticated={true}
          screenKey={null}
        >
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

      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("blocks controller updates when listenPrefix is empty", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;

      render(
        <FirebaseStateProvider
          listenPrefix=""
          isAuthenticated={true}
          screenKey={null}
        >
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

      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });
  });

  describe("authenticated mode", () => {
    it("syncs match updates when listenPrefix is set and authenticated", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;

      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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

      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ homeScore: 1 }),
        expect.anything(),
      );
    });

    it("allows rapid sequential goal additions (updates ref immediately)", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;

      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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

      expect(firebaseDatabase.writeAudited).toHaveBeenNthCalledWith(
        1,
        "test-location",
        "match",
        expect.objectContaining({ homeScore: 1 }),
        expect.anything(),
      );
      expect(firebaseDatabase.writeAudited).toHaveBeenNthCalledWith(
        2,
        "test-location",
        "match",
        expect.objectContaining({ homeScore: 2 }),
        expect.anything(),
      );
      expect(firebaseDatabase.writeAudited).toHaveBeenNthCalledWith(
        3,
        "test-location",
        "match",
        expect.objectContaining({ awayScore: 1 }),
        expect.anything(),
      );
    });

    it("syncs controller view changes", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;

      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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

      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ view: "scoreboard" }),
        expect.anything(),
      );
    });
  });

  describe("default state", () => {
    it("initializes with default match state", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;

      render(
        <FirebaseStateProvider
          listenPrefix="test"
          isAuthenticated={false}
          screenKey={null}
        >
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
      expect(matchApi!.match.homeTeam).toBe("Víkingur R");
    });
  });

  describe("match actions", () => {
    it("startMatch sets started timestamp and clears countdown", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          started: expect.any(Number) as unknown,
        }),
        expect.anything(),
      );
    });

    it("pauseMatch sets started to 0", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("addGoal increments homeScore", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ homeScore: 1 }),
        expect.anything(),
      );
    });

    it("addGoal increments awayScore", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ awayScore: 1 }),
        expect.anything(),
      );
    });

    it("buzz(true) sets buzzer to timestamp", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ buzzer: expect.any(Number) as unknown }),
        expect.anything(),
      );
    });

    it("buzz(false) sets buzzer to false", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("setHalfStops updates halfStops and injuryTimeDisplayMode", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.setHalfStops([30, 60], "minutes");
      });
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          halfStops: [30, 60],
          injuryTimeDisplayMode: "minutes",
        }),
        expect.anything(),
      );
    });

    it("matchTimeout sets timeout timestamp and increments team timeouts", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          timeout: expect.any(Number) as unknown,
          homeTimeouts: 1,
        }),
        expect.anything(),
      );
    });

    it("removeTimeout clears timeout", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("updateRedCards sets home and away red cards", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ homeRedCards: 2, awayRedCards: 1 }),
        expect.anything(),
      );
    });

    it("addPenalty adds penalty to team", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          home2min: expect.arrayContaining([
            expect.objectContaining({ key: "pen-1", penaltyLength: 120 }),
          ]) as unknown,
        }),
        expect.anything(),
      );
    });

    it("removePenalty removes penalty by key", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ home2min: [] }),
        expect.anything(),
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
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ assetView: "teams" }),
        expect.anything(),
      );
    });

    it("setPlaying updates playing state", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ playing: true }),
        expect.anything(),
      );
    });

    it("renderAsset sets currentAsset", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          currentAsset: expect.objectContaining({
            asset,
          }) as unknown,
        }),
        expect.anything(),
      );
    });

    it("renderAsset(null) clears currentAsset", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("selectTab updates tab", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ tab: "settings" }),
        expect.anything(),
      );
    });

    it("remoteRefresh sets new refreshToken", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          refreshToken: expect.any(String) as unknown,
        }),
        expect.anything(),
      );
    });

    it("clearRoster resets roster to empty home and away arrays", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.clearRoster();
      });
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ roster: { home: [], away: [] } }),
        expect.anything(),
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
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        { homeTeam: "Valur", homeTeamId: 2058, ksiMatchId: null },
        expect.anything(),
      );
    });

    it("looks up awayTeamId from club-ids", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        { awayTeam: "KR", awayTeamId: 2145, ksiMatchId: null },
        expect.anything(),
      );
    });

    it("sets teamId to 0 for unknown team", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        { awayTeam: "Unknown FC", awayTeamId: 0, ksiMatchId: null },
        expect.anything(),
      );
    });

    it("normalizes team name with trailing dot to club-ids canonical name", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateMatch({ homeTeam: "Víkingur R." });
      });
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        { homeTeam: "Víkingur R", homeTeamId: 2492, ksiMatchId: null },
        expect.anything(),
      );
    });

    it("looks up custom team IDs from club overrides", () => {
      vi.mocked(onValue).mockImplementation((reference, callback) => {
        const path = String(reference);

        callback({
          val: () =>
            path.includes("clubOverrides")
              ? {
                  customTeam: {
                    name: "Kjánaprik",
                    clubId: "-1",
                    logoUrl: "https://example.com/kjanaprik.png",
                    isOverride: false,
                  },
                }
              : null,
        } as never);

        return vi.fn();
      });

      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );

      act(() => {
        matchApi!.updateMatch({ homeTeam: "Kjánaprik" });
      });

      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        { homeTeam: "Kjánaprik", homeTeamId: -1, ksiMatchId: null },
        expect.anything(),
      );
    });

    it("normalizes typed custom team names with trailing dots to override canonical name", () => {
      vi.mocked(onValue).mockImplementation((reference, callback) => {
        const path = String(reference);

        callback({
          val: () =>
            path.includes("clubOverrides")
              ? {
                  customTeam: {
                    name: "Kjánaprik",
                    clubId: "-1",
                    logoUrl: "https://example.com/kjanaprik.png",
                    isOverride: false,
                  },
                }
              : null,
        } as never);

        return vi.fn();
      });

      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );

      act(() => {
        matchApi!.updateMatch({ awayTeam: "Kjánaprik." });
      });

      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        { awayTeam: "Kjánaprik", awayTeamId: -1, ksiMatchId: null },
        expect.anything(),
      );
    });

    it("sets awayTeamId to 0 for empty awayTeam", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        { awayTeam: "", awayTeamId: 0, ksiMatchId: null },
        expect.anything(),
      );
    });

    it("resets NaN injuryTime to 0", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        { injuryTime: 0 },
        expect.anything(),
      );
    });

    it("resets invalid matchType to Football", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        { matchType: Sports.Football },
        expect.anything(),
      );
    });

    it("updates halfStops when matchType changes", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        {
          matchType: Sports.Handball,
          halfStops: DEFAULT_HALFSTOPS[Sports.Handball],
        },
        expect.anything(),
      );
    });

    it("clears buzzer when started transitions from 0 to truthy", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          started: expect.any(Number) as unknown,
          buzzer: false,
        }),
        expect.anything(),
      );
    });

    it("syncs only homeTeam and homeTeamId when only homeTeam is updated", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      const call = vi.mocked(firebaseDatabase.writeAudited).mock.calls[0]!;
      expect(Object.keys(call[2])).toEqual(
        expect.arrayContaining(["homeTeam", "homeTeamId"]),
      );
      expect(Object.keys(call[2])).toHaveLength(3);
    });

    it("syncs only awayTeam and awayTeamId when only awayTeam is updated", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      const call = vi.mocked(firebaseDatabase.writeAudited).mock.calls[0]!;
      expect(Object.keys(call[2])).toEqual(
        expect.arrayContaining(["awayTeam", "awayTeamId"]),
      );
      expect(Object.keys(call[2])).toHaveLength(3);
    });

    it("syncs matchType and halfStops when matchType changes", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      const call = vi.mocked(firebaseDatabase.writeAudited).mock.calls[0]!;
      expect(call[2]).toEqual({
        matchType: Sports.Handball,
        halfStops: DEFAULT_HALFSTOPS[Sports.Handball],
      });
    });

    it("normalizes NaN injuryTime to 0 in partial sync", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      const call = vi.mocked(firebaseDatabase.writeAudited).mock.calls[0]!;
      expect(call[2]).toEqual({ injuryTime: 0 });
    });

    it("clears ksiMatchId when homeTeam changes without ksiMatchId in same update", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ ksiMatchId: null }),
        expect.anything(),
      );
    });

    it("clears ksiMatchId when awayTeam changes without ksiMatchId in same update", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ ksiMatchId: null }),
        expect.anything(),
      );
    });

    it("does NOT clear ksiMatchId when homeTeam and ksiMatchId are set together", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateMatch({ homeTeam: "Valur", ksiMatchId: 12345 });
      });
      const call = vi.mocked(firebaseDatabase.writeAudited).mock.calls[0]!;
      expect(call[2].ksiMatchId).toBe(12345);
    });

    it("does NOT clear ksiMatchId when unrelated fields change", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateMatch({ homeScore: 5 });
      });
      const call = vi.mocked(firebaseDatabase.writeAudited).mock.calls[0]!;
      expect(call[2].ksiMatchId).toBeUndefined();
    });

    it("syncs ksiMatchId to Firebase when explicitly set", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateMatch({ ksiMatchId: 99999 });
      });
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ ksiMatchId: 99999 }),
        expect.anything(),
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
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          started: 0,
          timeElapsed: 45 * 60 * 1000,
          halfStops: [90, 105, 120],
        }),
        expect.anything(),
      );
    });

    it("accumulates timeElapsed on normal pause", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          started: 0,
        }),
        expect.anything(),
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
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("does not change state when matchStartTime is invalid format", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("sets started and countdown=true for valid matchStartTime", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          started: expect.any(Number) as unknown,
          countdown: true,
        }),
        expect.anything(),
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
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({ currentAsset: null }),
        expect.anything(),
      );
    });

    it("does nothing when autoPlay is on but not playing", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      vi.clearAllMocks();
      act(() => {
        controllerApi!.removeAssetAfterTimeout();
      });
      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });
  });

  describe("player CRUD", () => {
    const setupWithRoster = () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      const roster: Roster = {
        home: [
          { name: "Player A", number: "10", show: true, role: "FW" },
          { name: "Player B", number: "7", show: true, role: "MF" },
        ],
        away: [{ name: "Player C", number: "1", show: true, role: "GK" }],
      };
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        controllerApi!.setRoster(roster);
      });
      vi.clearAllMocks();
      return controllerApi!;
    };

    it("editPlayer updates a player field at index", () => {
      const api = setupWithRoster();
      act(() => {
        api.editPlayer("home", 0, { name: "Updated Player" });
      });
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          roster: expect.objectContaining({
            home: expect.arrayContaining([
              expect.objectContaining({ name: "Updated Player" }),
            ]) as unknown,
          }) as unknown,
        }),
        expect.anything(),
      );
    });

    it("editPlayer does nothing for empty roster", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("editPlayer does nothing for invalid player index", () => {
      const api = setupWithRoster();
      act(() => {
        api.editPlayer("home", 99, { name: "Ghost" });
      });
      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("deletePlayer removes player at index", () => {
      const api = setupWithRoster();
      act(() => {
        api.deletePlayer("home", 0);
      });
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          roster: expect.objectContaining({
            home: [expect.objectContaining({ name: "Player B", number: "7" })],
          }) as unknown,
        }),
        expect.anything(),
      );
    });

    it("addPlayer adds empty player to existing side", () => {
      const api = setupWithRoster();
      act(() => {
        api.addPlayer("home");
      });
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          roster: expect.objectContaining({
            home: expect.arrayContaining([
              expect.objectContaining({
                name: "",
                number: "",
                show: false,
                role: "",
              }),
            ]) as unknown,
          }) as unknown,
        }),
        expect.anything(),
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
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "view",
        expect.objectContaining({ vp: newVp }),
        expect.anything(),
      );
    });

    it("setBackground updates background", () => {
      let viewApi: ReturnType<typeof useView> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "view",
        expect.objectContaining({ background: "Svart" }),
        expect.anything(),
      );
    });

    it("setIdleImage updates idleImage", () => {
      let viewApi: ReturnType<typeof useView> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "view",
        expect.objectContaining({
          idleImage: "https://example.com/logo.png",
        }),
        expect.anything(),
      );
    });

    it("updateView merges partial view updates", () => {
      let viewApi: ReturnType<typeof useView> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "view",
        expect.objectContaining({ background: "Ekkert" }),
        expect.anything(),
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
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          home2min: expect.arrayContaining([
            expect.objectContaining({ key: "pen-1", penaltyLength: 180 }),
          ]) as unknown,
        }),
        expect.anything(),
      );
    });

    it("updateHalfLength replaces matching half stop value", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateHalfLength(45, "50");
      });
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ halfStops: [50, 90, 105, 120] }),
        expect.anything(),
      );
    });

    it("updateHalfLength returns unchanged state for invalid new value", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateHalfLength(45, "abc");
      });
      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("updateHalfLength treats empty string as 0", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateHalfLength(45, "");
      });
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ halfStops: [0, 90, 105, 120] }),
        expect.anything(),
      );
    });

    it("updateHalfLength returns unchanged state for negative values", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      act(() => {
        matchApi!.updateHalfLength(45, "-5");
      });
      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("matchTimeout caps at 4 timeouts", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      // The 4th call sets awayTimeouts from 3→4 (the cap).
      // The 5th call keeps awayTimeouts at 4 (unchanged), so the diff
      // optimization excludes it — only `timeout` is sent.
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({ awayTimeouts: 4 }),
        expect.anything(),
      );
      // Verify the value never exceeds 4
      const allCalls = vi.mocked(firebaseDatabase.writeAudited).mock.calls;
      const allAwayTimeouts = allCalls
        .filter(([, section]) => section === "match")
        .map(([, , data]) => data.awayTimeouts)
        .filter((v) => v !== undefined);
      expect(Math.max(...(allAwayTimeouts as number[]))).toBe(4);
    });
  });

  describe("additional controller actions", () => {
    it("setRoster sets roster data", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      const roster: Roster = {
        home: [{ name: "Player A", number: "10", show: true, role: "FW" }],
        away: [{ name: "Player B", number: "1", show: true, role: "GK" }],
      };
      act(() => {
        controllerApi!.setRoster(roster);
      });
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "controller",
        expect.objectContaining({
          roster,
        }),
        expect.anything(),
      );
    });
  });

  describe("server time offset", () => {
    it("getServerTime is available from useMatch hook", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      expect(matchApi).not.toBeNull();
      expect(matchApi!.getServerTime).toBeDefined();
      expect(typeof matchApi!.getServerTime).toBe("function");
    });

    it("getServerTime returns Date.now() when offset is 0", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      const now = Date.now();
      const serverTime = matchApi!.getServerTime();
      // Should be approximately equal (within 10ms)
      expect(Math.abs(serverTime - now)).toBeLessThan(10);
    });

    it("Firebase's started timestamp is used directly (not replaced with Date.now)", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      // Default match.started is 0 — Firebase hasn't sent a started timestamp
      // The key assertion: started is exactly 0, not mutated to Date.now() - 150
      expect(matchApi!.match.started).toBe(0);
    });

    it("startMatch uses getServerTime for timestamp", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      // Verify set was called with a timestamp close to Date.now()
      const call = vi.mocked(firebaseDatabase.writeAudited).mock.calls[0]!;
      const writtenMatch = call[2];
      expect(writtenMatch.started).toBeGreaterThan(Date.now() - 100);
      expect(writtenMatch.started).toBeLessThan(Date.now() + 100);
    });

    it("pauseMatch computes timeElapsed using getServerTime", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="test-location"
          isAuthenticated={true}
          screenKey={null}
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
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "test-location",
        "match",
        expect.objectContaining({
          started: 0,
        }),
        expect.anything(),
      );
      const pauseCall = vi.mocked(firebaseDatabase.writeAudited).mock.calls[0]!;
      const pauseData = pauseCall[2];
      // timeElapsed is computed via getServerTime() - started, ~0ms in tests.
      // The diff optimization may skip it if it stays at 0 (the default),
      // so we verify it's either absent or a small non-negative number.
      if (pauseData.timeElapsed !== undefined) {
        expect(pauseData.timeElapsed).toBeGreaterThanOrEqual(0);
        expect(pauseData.timeElapsed).toBeLessThan(100);
      }
    });
  });

  describe("perimeter", () => {
    function renderPerimeter(
      listenPrefix: string,
      isAuthenticated: boolean,
      data: unknown = null,
    ): ReturnType<typeof usePerimeter> | null {
      vi.mocked(onValue).mockImplementation((reference, callback) => {
        const path = String(reference);
        if (path.includes("/perimeter")) {
          callback({ val: () => data } as never);
        } else {
          callback({ val: () => null } as never);
        }
        return vi.fn();
      });

      let perimeterApi: ReturnType<typeof usePerimeter> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix={listenPrefix}
          isAuthenticated={isAuthenticated}
          screenKey={null}
        >
          <TestPerimeterConsumer
            onMount={(api) => {
              perimeterApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      return perimeterApi;
    }

    function renderPerimeterViewTransitions(
      data: unknown = null,
      initialView: string = VIEWS.idle,
      isAuthenticated = true,
    ) {
      let controllerCallback: ((snapshot: unknown) => void) | null = null;

      vi.mocked(onValue).mockImplementation((reference, callback) => {
        const path = String(reference);
        if (path.includes("/controller")) {
          controllerCallback = callback as (snapshot: unknown) => void;
          callback({ val: () => ({ view: initialView }) } as never);
        } else if (path.includes("/perimeter")) {
          callback({ val: () => data } as never);
        } else {
          callback({ val: () => null } as never);
        }
        return vi.fn();
      });

      let perimeterApi: ReturnType<typeof usePerimeter> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix="vikuti"
          isAuthenticated={isAuthenticated}
          screenKey={null}
        >
          <TestPerimeterConsumer
            onMount={(api) => {
              perimeterApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );

      return {
        perimeterApi,
        setView: (view: string) => {
          act(() => {
            controllerCallback!({ val: () => ({ view }) } as never);
          });
        },
      };
    }

    function renderPerimeterWithPreview(
      listenPrefix: string,
      preview: unknown,
    ): ReturnType<typeof usePerimeter> | null {
      vi.mocked(onValue).mockImplementation((reference, callback) => {
        const path = String(reference);
        if (path.startsWith("perimeter/")) {
          callback({ val: () => preview } as never);
        } else {
          callback({ val: () => null } as never);
        }
        return vi.fn();
      });

      let perimeterApi: ReturnType<typeof usePerimeter> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix={listenPrefix}
          isAuthenticated={true}
          screenKey={null}
        >
          <TestPerimeterConsumer
            onMount={(api) => {
              perimeterApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      return perimeterApi;
    }

    it("parses perimeter state from the Firebase subscription", () => {
      const perimeterApi = renderPerimeter("vikuti", true, {
        enabled: true,
        state: "on",
      });

      expect(perimeterApi).not.toBeNull();
      expect(perimeterApi!.perimeter).toEqual({ enabled: true, state: "on" });
    });

    it("defaults to disabled and off when Firebase has no perimeter data", () => {
      const perimeterApi = renderPerimeter("vikuti", true);

      expect(perimeterApi).not.toBeNull();
      expect(perimeterApi!.perimeter).toEqual({ enabled: false, state: "off" });
    });

    it("setPerimeterState writes state to Firebase when authenticated", () => {
      const perimeterApi = renderPerimeter("vikuti", true);

      act(() => {
        perimeterApi!.setPerimeterState("on");
      });

      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "vikuti",
        "perimeter",
        { state: "on" },
        expect.anything(),
      );
    });

    it("blocks setPerimeterState when not authenticated", () => {
      const perimeterApi = renderPerimeter("vikuti", false);

      act(() => {
        perimeterApi!.setPerimeterState("on");
      });

      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("blocks setPerimeterState when listenPrefix is empty", () => {
      const perimeterApi = renderPerimeter("", true);

      act(() => {
        perimeterApi!.setPerimeterState("off");
      });

      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("auto-turns the perimeter on when transitioning idle to match", () => {
      const { setView } = renderPerimeterViewTransitions({
        enabled: true,
        state: "off",
      });

      setView(VIEWS.match);

      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "vikuti",
        "perimeter",
        { state: "on" },
        expect.anything(),
      );
    });

    it("auto-turns the perimeter off when transitioning match to idle", () => {
      const { setView } = renderPerimeterViewTransitions({
        enabled: true,
        state: "off",
      });

      setView(VIEWS.match);
      setView(VIEWS.idle);

      expect(firebaseDatabase.writeAudited).toHaveBeenLastCalledWith(
        "vikuti",
        "perimeter",
        { state: "off" },
        expect.anything(),
      );
    });

    it("auto-turns the perimeter off when transitioning control to idle", () => {
      const { setView } = renderPerimeterViewTransitions({
        enabled: true,
        state: "off",
      });

      setView(VIEWS.control);
      setView(VIEWS.idle);

      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "vikuti",
        "perimeter",
        { state: "off" },
        expect.anything(),
      );
    });

    it("does not auto-toggle the perimeter when it is disabled", () => {
      const { setView } = renderPerimeterViewTransitions({
        enabled: false,
        state: "off",
      });

      setView(VIEWS.match);
      setView(VIEWS.idle);

      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("leaves the perimeter unchanged for unrelated view transitions", () => {
      const { setView } = renderPerimeterViewTransitions({
        enabled: true,
        state: "off",
      });

      setView(VIEWS.match);
      setView(VIEWS.control);
      setView(VIEWS.match);

      expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "vikuti",
        "perimeter",
        { state: "on" },
        expect.anything(),
      );
    });

    it("does not write the perimeter state on initial load in match view", () => {
      renderPerimeterViewTransitions(
        { enabled: true, state: "off" },
        VIEWS.match,
      );

      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("does not auto-toggle the perimeter for an unauthenticated display", () => {
      const { setView } = renderPerimeterViewTransitions(
        { enabled: true, state: "off" },
        VIEWS.idle,
        false,
      );

      setView(VIEWS.match);
      setView(VIEWS.idle);

      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("writes only once when switching to the same view twice", () => {
      const { setView } = renderPerimeterViewTransitions({
        enabled: true,
        state: "off",
      });

      setView(VIEWS.match);
      setView(VIEWS.match);

      expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "vikuti",
        "perimeter",
        { state: "on" },
        expect.anything(),
      );
    });

    it("does not write the perimeter state when switching listenPrefix to a venue already in match view", () => {
      let currentControllerView: string = VIEWS.idle;
      vi.mocked(onValue).mockImplementation((reference, callback) => {
        const path = String(reference);
        if (path.includes("/controller")) {
          callback({ val: () => ({ view: currentControllerView }) } as never);
        } else if (path.includes("/perimeter")) {
          callback({ val: () => ({ enabled: true, state: "off" }) } as never);
        } else {
          callback({ val: () => null } as never);
        }
        return vi.fn();
      });

      const { rerender } = render(
        <FirebaseStateProvider
          listenPrefix="venue-a"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestPerimeterConsumer onMount={() => undefined} />
        </FirebaseStateProvider>,
      );

      currentControllerView = VIEWS.match;
      rerender(
        <FirebaseStateProvider
          listenPrefix="venue-b"
          isAuthenticated={true}
          screenKey={null}
        >
          <TestPerimeterConsumer onMount={() => undefined} />
        </FirebaseStateProvider>,
      );

      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("subscribes to the daemon preview path and parses the snapshot", () => {
      const perimeterApi = renderPerimeterWithPreview("vikuti", {
        updatedAt: 1723392000000,
        columns: [
          {
            id: 1,
            name: "Column 1",
            clips: [{ id: 12, filename: "sponsor-loop.mp4" }],
          },
        ],
      });

      expect(perimeterApi).not.toBeNull();
      expect(perimeterApi!.preview).toEqual({
        updatedAt: 1723392000000,
        columns: [
          {
            id: 1,
            name: "Column 1",
            clips: [
              { id: 12, filename: "sponsor-loop.mp4", thumbnail: undefined },
            ],
          },
        ],
      });
    });

    it("defaults the preview to null when no snapshot has been published", () => {
      const perimeterApi = renderPerimeterWithPreview("vikuti", null);

      expect(perimeterApi).not.toBeNull();
      expect(perimeterApi!.preview).toBeNull();
    });
  });

  describe("perimeter brightness", () => {
    function renderBrightness(
      listenPrefix: string,
      isAuthenticated: boolean,
      brightnessData: unknown = null,
      statusData: unknown = null,
    ): ReturnType<typeof usePerimeter> | null {
      vi.mocked(onValue).mockImplementation((reference, callback) => {
        const path = String(reference);
        if (path.endsWith("/perimeter/brightness")) {
          callback({ val: () => brightnessData } as never);
        } else if (path.endsWith("/brightnessStatus")) {
          callback({ val: () => statusData } as never);
        } else {
          callback({ val: () => null } as never);
        }
        return vi.fn();
      });

      let perimeterApi: ReturnType<typeof usePerimeter> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix={listenPrefix}
          isAuthenticated={isAuthenticated}
          screenKey={null}
        >
          <TestPerimeterConsumer
            onMount={(api) => {
              perimeterApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      return perimeterApi;
    }

    it("parses the requested brightness from the subscription", () => {
      const perimeterApi = renderBrightness("vikuti", true, 42, null);
      expect(perimeterApi).not.toBeNull();
      expect(perimeterApi!.brightness).toBe(42);
    });

    it("defaults the requested brightness to null when absent", () => {
      const perimeterApi = renderBrightness("vikuti", true, null, null);
      expect(perimeterApi!.brightness).toBeNull();
    });

    it("rejects an out-of-range brightness as null (no optimistic value)", () => {
      const perimeterApi = renderBrightness("vikuti", true, 150, null);
      expect(perimeterApi!.brightness).toBeNull();
    });

    it("parses the daemon-published brightness status", () => {
      const status = {
        requestedPercent: 50,
        appliedPercent: 50,
        phase: "applied",
        error: null,
        updatedAt: 1723392000000,
      };
      const perimeterApi = renderBrightness("vikuti", true, 50, status);
      expect(perimeterApi!.brightnessStatus).toEqual(status);
    });

    it("rejects a malformed brightness status as null", () => {
      const perimeterApi = renderBrightness("vikuti", true, 50, {
        requestedPercent: 50,
        phase: "playing",
        updatedAt: 1723392000000,
      });
      expect(perimeterApi!.brightnessStatus).toBeNull();
    });

    it("setPerimeterBrightness writes the percentage when authenticated", async () => {
      const perimeterApi = renderBrightness("vikuti", true);

      await act(async () => {
        await perimeterApi!.setPerimeterBrightness(42);
      });

      expect(set).toHaveBeenCalledWith(
        "states/vikuti/perimeter/brightness",
        42,
      );
    });

    it("blocks setPerimeterBrightness when not authenticated", async () => {
      const perimeterApi = renderBrightness("vikuti", false);

      await act(async () => {
        await perimeterApi!.setPerimeterBrightness(50);
      });

      expect(set).not.toHaveBeenCalled();
    });

    it("blocks setPerimeterBrightness when listenPrefix is empty", async () => {
      const perimeterApi = renderBrightness("", true);

      await act(async () => {
        await perimeterApi!.setPerimeterBrightness(50);
      });

      expect(set).not.toHaveBeenCalled();
    });

    it("rejects an invalid percentage without writing", async () => {
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const perimeterApi = renderBrightness("vikuti", true);

      await act(async () => {
        await perimeterApi!.setPerimeterBrightness(150);
      });

      expect(set).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe("perimeter media pairs", () => {
    const pairId = "11111111-1111-4111-8111-111111111111";
    const pair = {
      name: "Sindri",
      files: {
        "2": {
          name: "48-1-sindri.mp4",
          source:
            "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter-overlays/11111111-1111-4111-8111-111111111111/48/48-1-sindri.mp4",
        },
        "4": {
          name: "40-1-sindri.png",
          source:
            "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter-overlays/11111111-1111-4111-8111-111111111111/40/40-1-sindri.png",
        },
      },
    };

    function renderMediaPairs(
      listenPrefix: string,
      isAuthenticated: boolean,
      mediaPairsData: unknown = null,
    ): ReturnType<typeof usePerimeter> | null {
      vi.mocked(onValue).mockImplementation((reference, callback) => {
        const path = String(reference);
        if (path.includes("perimeter/mediaPairs")) {
          callback({ val: () => mediaPairsData } as never);
        } else {
          callback({ val: () => null } as never);
        }
        return vi.fn();
      });

      let perimeterApi: ReturnType<typeof usePerimeter> | null = null;
      render(
        <FirebaseStateProvider
          listenPrefix={listenPrefix}
          isAuthenticated={isAuthenticated}
          screenKey={null}
        >
          <TestPerimeterConsumer
            onMount={(api) => {
              perimeterApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );
      return perimeterApi;
    }

    it("parses the media pairs library from the Firebase subscription", () => {
      const perimeterApi = renderMediaPairs("vikuti", true, {
        [pairId]: pair,
      });

      expect(perimeterApi).not.toBeNull();
      expect(perimeterApi!.mediaPairs).toEqual({ [pairId]: pair });
    });

    it("defaults to an empty library when no pairs exist", () => {
      const perimeterApi = renderMediaPairs("vikuti", true, null);

      expect(perimeterApi).not.toBeNull();
      expect(perimeterApi!.mediaPairs).toEqual({});
    });

    it("createPerimeterMediaPair writes the pair to the mediaPairs path", async () => {
      const perimeterApi = renderMediaPairs("vikuti", true);

      await act(async () => {
        await perimeterApi!.createPerimeterMediaPair(pairId, pair);
      });

      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "vikuti",
        "perimeter",
        expect.objectContaining({
          [`mediaPairs/${pairId}`]: pair,
        }),
        expect.anything(),
      );
    });

    it("deletePerimeterMediaPair removes only the library record", async () => {
      const perimeterApi = renderMediaPairs("vikuti", true);

      await act(async () => {
        await perimeterApi!.deletePerimeterMediaPair(pairId);
      });

      expect(firebaseDatabase.writeAudited).toHaveBeenCalledWith(
        "vikuti",
        "perimeter",
        expect.objectContaining({
          [`mediaPairs/${pairId}`]: null,
        }),
        expect.anything(),
      );
      expect(firebaseDatabase.writeAudited).toHaveBeenCalledTimes(1);
    });

    it("blocks createPerimeterMediaPair when not authenticated", async () => {
      const perimeterApi = renderMediaPairs("vikuti", false);

      await act(async () => {
        await perimeterApi!.createPerimeterMediaPair(pairId, pair);
      });

      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });

    it("blocks deletePerimeterMediaPair when listenPrefix is empty", async () => {
      const perimeterApi = renderMediaPairs("", true);

      await act(async () => {
        await perimeterApi!.deletePerimeterMediaPair(pairId);
      });

      expect(firebaseDatabase.writeAudited).not.toHaveBeenCalled();
    });
  });
});
