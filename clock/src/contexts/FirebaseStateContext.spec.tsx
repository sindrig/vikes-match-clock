import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import {
  FirebaseStateProvider,
  useMatch,
  useController,
} from "./FirebaseStateContext";

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
    it("blocks match updates when listenPrefix is empty", async () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;

      render(
        <FirebaseStateProvider
          sync={false}
          listenPrefix=""
          isAuthenticated={false}
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

      expect(matchApi!.match.homeScore).toBe(0);
    });

    it("blocks controller updates when listenPrefix is empty", async () => {
      let controllerApi: ReturnType<typeof useController> | null = null;

      render(
        <FirebaseStateProvider
          sync={false}
          listenPrefix=""
          isAuthenticated={false}
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

      expect(controllerApi!.controller.view).toBe("idle");
    });
  });

  describe("non-sync mode (local only)", () => {
    it("allows match updates when listenPrefix is set and sync is false", async () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;

      render(
        <FirebaseStateProvider
          sync={false}
          listenPrefix="test-location"
          isAuthenticated={false}
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

      expect(matchApi!.match.homeScore).toBe(1);
    });

    it("allows rapid sequential goal additions", async () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;

      render(
        <FirebaseStateProvider
          sync={false}
          listenPrefix="test-location"
          isAuthenticated={false}
        >
          <TestMatchConsumer
            onMount={(api) => {
              matchApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );

      expect(matchApi!.match.homeScore).toBe(0);

      act(() => {
        matchApi!.addGoal("home");
      });
      act(() => {
        matchApi!.addGoal("home");
      });
      act(() => {
        matchApi!.addGoal("away");
      });

      expect(matchApi!.match.homeScore).toBe(2);
      expect(matchApi!.match.awayScore).toBe(1);
    });

    it("allows controller view changes", async () => {
      let controllerApi: ReturnType<typeof useController> | null = null;

      render(
        <FirebaseStateProvider
          sync={false}
          listenPrefix="test-location"
          isAuthenticated={false}
        >
          <TestControllerConsumer
            onMount={(api) => {
              controllerApi = api;
            }}
          />
        </FirebaseStateProvider>,
      );

      expect(controllerApi!.controller.view).toBe("idle");

      act(() => {
        controllerApi!.selectView("scoreboard");
      });

      expect(controllerApi!.controller.view).toBe("scoreboard");
    });
  });

  describe("default state", () => {
    it("initializes with default match state", () => {
      let matchApi: ReturnType<typeof useMatch> | null = null;

      render(
        <FirebaseStateProvider
          sync={false}
          listenPrefix="test"
          isAuthenticated={false}
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
      expect(matchApi!.match.homeTeam).toBe("Vikingur R");
    });

    it("initializes with default controller state", () => {
      let controllerApi: ReturnType<typeof useController> | null = null;

      render(
        <FirebaseStateProvider
          sync={false}
          listenPrefix="test"
          isAuthenticated={false}
        >
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
});
