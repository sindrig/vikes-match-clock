import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import {
  FirebaseStateProvider,
  useMatch,
  useController,
} from "./FirebaseStateContext";

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
});
