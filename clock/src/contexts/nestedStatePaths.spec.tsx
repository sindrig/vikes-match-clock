import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Sports } from "../constants";
import Asset, {
  PlaybackAsset,
  useDeferredAsset,
} from "../controller/asset/Asset";
import Team from "../controller/asset/team/Team";
import MatchLifecycle from "../match/MatchLifecycle";
import type { ControllerState, Match, ViewState } from "../types";
import { useController, useMatch, useView } from "./FirebaseStateContext";
import { parseController, parseMatch, parseView } from "./firebaseParsers";

vi.mock("./FirebaseStateContext", () => ({
  useController: vi.fn(),
  useMatch: vi.fn(),
  useView: vi.fn(),
  useClubOverrides: () => ({ clubOverrides: {} }),
}));

const matchDefaults: Match = {
  homeScore: 0,
  awayScore: 0,
  started: 0,
  timeElapsed: 0,
  halfStops: [45, 90],
  homeTeam: "Víkingur R",
  awayTeam: "Valur",
  homeTeamId: 2492,
  awayTeamId: 2485,
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
const controllerDefaults: ControllerState = {
  queues: {},
  activeQueueId: null,
  playing: false,
  assetView: "assets",
  view: "match",
  roster: { home: [], away: [] },
  currentAsset: null,
  refreshToken: "",
};
const viewDefaults: ViewState = {
  vp: { key: "main", name: "Main", style: { width: 512, height: 400 } },
  background: "Default",
};
const playerCard = {
  type: "NO_IMAGE_PLAYER",
  key: "custom-7-Jón",
  name: "Jón Jónsson",
  number: "07",
  teamName: "Víkingur R",
  overlay: { text: "MARK!", blink: true, effect: "flash" },
};
const complete = vi.fn().mockResolvedValue(true);
const removePenalty = vi.fn().mockResolvedValue(true);
const otherMutation = vi.fn().mockResolvedValue(true);

function prepare(raw: {
  controller?: unknown;
  match?: unknown;
  view?: unknown;
}) {
  const controller = parseController(raw.controller ?? {}, controllerDefaults)!;
  const match = parseMatch(raw.match ?? {}, matchDefaults)!;
  const view = parseView(raw.view ?? {}, viewDefaults)!;
  vi.mocked(useController).mockReturnValue({
    controller,
    completeAssetIfCurrent: complete,
    editPlayer: otherMutation,
  } as unknown as ReturnType<typeof useController>);
  vi.mocked(useMatch).mockReturnValue({
    match,
    writeEligible: true,
    getServerTime: () => Date.now(),
    completeCountdownIfCurrent: otherMutation,
    applyHalfStopIfCurrent: otherMutation,
    removeTimeoutIfCurrent: otherMutation,
    removePenaltyIfCurrent: removePenalty,
    buzz: otherMutation,
  } as unknown as ReturnType<typeof useMatch>);
  vi.mocked(useView).mockReturnValue({ view } as ReturnType<typeof useView>);
  return { controller, match, view };
}
function DeferredDisplay() {
  const { controller } = useController();
  const current = useDeferredAsset(controller.currentAsset);
  return current ? <PlaybackAsset current={current} /> : null;
}

describe("nested snapshot ingestion through real consumers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 10 }),
    } as CanvasRenderingContext2D);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    { ...playerCard, background: { nested: "not a URL" } },
    { ...playerCard, name: { nested: "not text" } },
    { ...playerCard, number: { nested: 7 } },
    { ...playerCard, overlay: { text: { nested: "MARK!" } } },
    {
      type: "SUB",
      key: "bad-sub",
      subIn: { ...playerCard, background: ["bad.mp4"] },
      subOut: playerCard,
    },
    {
      type: "SUB",
      key: "recursive-sub",
      subIn: {
        type: "SUB",
        key: "nested",
        subIn: playerCard,
        subOut: playerCard,
      },
      subOut: playerCard,
    },
  ])(
    "does not preload, render or expire a malformed card: %j",
    async (asset) => {
      prepare({ controller: { currentAsset: { asset, time: 0.1 } } });
      const result = render(
        <>
          <DeferredDisplay />
          <MatchLifecycle />
        </>,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(result.container).toBeEmptyDOMElement();
      expect(complete).not.toHaveBeenCalled();
      expect(otherMutation).not.toHaveBeenCalled();
    },
  );

  it("renders surviving roster rows and does not expire malformed penalties", async () => {
    const { controller, match } = prepare({
      controller: {
        roster: {
          home: [
            { id: 1, name: "Jón Jónsson", number: 0, show: true },
            null,
            { name: { nested: "bad" }, number: 3 },
            { id: "foreign-player", name: "李 明", number: "A7" },
            { name: "Coach", number: null, role: "Þjálfari" },
          ],
        },
      },
      match: {
        timeElapsed: 100,
        home2min: [
          { key: "good", atTimeElapsed: 100, penaltyLength: 120000 },
          { key: "bad", atTimeElapsed: [], penaltyLength: false },
        ],
      },
    });
    render(
      <>
        <Team teamName="homeTeam" />
        <MatchLifecycle />
      </>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.getByText("Jón Jónsson")).toBeInTheDocument();
    expect(screen.getByText("李 明")).toBeInTheDocument();
    expect(screen.getByText("Coach")).toBeInTheDocument();
    expect(controller.roster.home).toHaveLength(3);
    expect(match.home2min).toHaveLength(1);
    expect(removePenalty).not.toHaveBeenCalled();
    expect(otherMutation).not.toHaveBeenCalled();
  });

  it("renders a valid player with a malformed viewport using safe defaults", () => {
    const { controller } = prepare({
      controller: { currentAsset: { asset: playerCard } },
      view: { vp: { key: "indoor", style: null, fontSize: {} } },
    });
    render(<Asset asset={controller.currentAsset!.asset} />);
    expect(screen.getByText("Jón Jónsson")).toBeInTheDocument();
    expect(screen.getByText("MARK!")).toBeInTheDocument();
    expect(complete).not.toHaveBeenCalled();
    expect(otherMutation).not.toHaveBeenCalled();
  });

  it("keeps viewport metadata while rendering only CSS scalar values", () => {
    const { controller, view } = prepare({
      controller: {
        currentAsset: {
          asset: {
            type: "SUB",
            key: "valid-sub",
            subIn: playerCard,
            subOut: { ...playerCard, key: "other", name: "Óli" },
          },
        },
      },
      view: {
        vp: {
          key: "insidebig",
          name: "Indoor",
          fontSize: "200%",
          style: {
            width: "960",
            height: "540",
            marginLeft: { toString: null },
            calibration: { revision: 2 },
          },
        },
      },
    });
    const { container } = render(
      <Asset asset={controller.currentAsset!.asset} />,
    );
    expect(screen.getByText("Óli")).toBeInTheDocument();
    expect(container.querySelector(".asset-substitution")).toHaveStyle({
      width: "960px",
      height: "540px",
    });
    expect(view.vp.style.calibration).toEqual({ revision: 2 });
    expect(view.vp.style.marginLeft).toEqual({ toString: null });
    expect(complete).not.toHaveBeenCalled();
    expect(otherMutation).not.toHaveBeenCalled();
  });
});
