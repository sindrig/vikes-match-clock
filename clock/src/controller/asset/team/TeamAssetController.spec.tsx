import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TeamAssetController from "./TeamAssetController";
import { Player, Roster } from "../../../types";
import {
  useController,
  useMatch,
  useListeners,
} from "../../../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../../../contexts/LocalStateContext";
import { transformLineups, getTeamId } from "../../../lib/matchUtils";
import { getLineups } from "../../../api/client";

vi.mock("../../../contexts/FirebaseStateContext", () => ({
  useMatch: vi.fn(),
  useController: vi.fn(),
  useListeners: vi.fn(),
}));

vi.mock("../../../contexts/LocalStateContext", () => ({
  useRemoteSettings: vi.fn(),
}));

vi.mock("../../../api/client", () => ({
  getLineups: vi.fn(),
}));

vi.mock("../../../lib/matchUtils", () => ({
  transformLineups: vi.fn(),
  getTeamId: vi.fn(),
}));

vi.mock("./Team", () => ({
  default: ({
    teamName,
    selectPlayer,
  }: {
    teamName: string;
    selectPlayer?: ((player: Player, teamName: string) => void) | null;
  }) => (
    <div data-testid={`team-${teamName}`}>
      {selectPlayer && (
        <button
          data-testid={`select-player-${teamName}`}
          onClick={() =>
            selectPlayer(
              {
                name: "Jón Jónsson",
                id: 101,
                number: 10,
                role: "midfielder",
                show: true,
              },
              teamName,
            )
          }
        >
          Select Player
        </button>
      )}
    </div>
  ),
}));

vi.mock("./SubView", () => ({
  default: ({
    subIn,
    subOut,
    subTeam,
  }: {
    subIn?: Player | null;
    subOut?: Player | null;
    subTeam?: string | null;
  }) => (
    <div data-testid="sub-view">
      {subTeam && <span data-testid="sub-team">{subTeam}</span>}
      {subIn && <span data-testid="sub-in">{subIn.name}</span>}
      {subOut && <span data-testid="sub-out">{subOut.name}</span>}
    </div>
  ),
}));

vi.mock("./assetHelpers", () => ({
  getPlayerAssetObject: vi.fn(),
  getMOTMAsset: vi.fn(),
}));

vi.mock("react-spinners", () => ({
  RingLoader: ({ loading }: { loading: boolean }) =>
    loading ? <div data-testid="ring-loader">Loading...</div> : null,
}));

import { getPlayerAssetObject, getMOTMAsset } from "./assetHelpers";

const mockedUseMatch = vi.mocked(useMatch);
const mockedUseController = vi.mocked(useController);
const mockedUseListeners = vi.mocked(useListeners);
const mockedUseRemoteSettings = vi.mocked(useRemoteSettings);
const mockedGetLineups = vi.mocked(getLineups);
const mockedTransformLineups = vi.mocked(transformLineups);
const mockedGetTeamId = vi.mocked(getTeamId);
const mockedGetPlayerAssetObject = vi.mocked(getPlayerAssetObject);
const mockedGetMOTMAsset = vi.mocked(getMOTMAsset);

const mockPlayers: Player[] = [
  { name: "Jón Jónsson", id: 101, number: 10, role: "midfielder", show: true },
  { name: "Ólafur Ólafsson", id: 102, number: 7, role: "forward", show: true },
  {
    name: "Sigurður Sigurðsson",
    id: 103,
    number: 1,
    role: "keeper",
    show: true,
  },
];

const mockAwayPlayers: Player[] = [
  {
    name: "Gunnar Gunnarsson",
    id: 201,
    number: 9,
    role: "forward",
    show: true,
  },
  {
    name: "Bjarni Bjarnason",
    id: 202,
    number: 5,
    role: "defender",
    show: true,
  },
];

const mockRoster: Roster = {
  home: mockPlayers,
  away: mockAwayPlayers,
};

const defaultMatch = {
  homeTeam: "Víkingur R",
  awayTeam: "KR",
  homeScore: 0,
  awayScore: 0,
  started: 0,
  timeElapsed: 0,
  halfStops: [45, 90],
  homeTeamId: 2492,
  awayTeamId: 2145,
  injuryTime: 0,
  matchType: "football" as const,
  home2min: [],
  away2min: [],
  timeout: 0,
  homeTimeouts: 0,
  awayTimeouts: 0,
  buzzer: false as const,
  countdown: false,
  ksiMatchId: 12345,
};

function setupMocks(overrides?: {
  match?: Partial<typeof defaultMatch>;
  roster?: Roster;
}) {
  const mockClearRoster = vi.fn();
  const mockSetRoster = vi.fn();
  const mockShowItemNow = vi.fn();
  const mockCreateQueue = vi
    .fn<(name: string) => string>()
    .mockReturnValue("new-queue-id");
  const mockDeleteQueue = vi.fn();
  const mockAddItemsToQueue = vi.fn();

  mockedUseMatch.mockReturnValue({
    match: { ...defaultMatch, ...overrides?.match },
  } as unknown as ReturnType<typeof useMatch>);

  mockedUseController.mockReturnValue({
    controller: {
      roster: overrides?.roster ?? { home: [], away: [] },
      queues: {},
    },
    clearRoster: mockClearRoster,
    setRoster: mockSetRoster,
    showItemNow: mockShowItemNow,
    createQueue: mockCreateQueue,
    deleteQueue: mockDeleteQueue,
    addItemsToQueue: mockAddItemsToQueue,
  } as unknown as ReturnType<typeof useController>);

  mockedUseRemoteSettings.mockReturnValue({
    listenPrefix: "vikinni",
  } as unknown as ReturnType<typeof useRemoteSettings>);

  mockedUseListeners.mockReturnValue({
    screens: [{ key: "vikinni", teamId: 2492 }],
  } as unknown as ReturnType<typeof useListeners>);

  mockedGetTeamId.mockReturnValue(2492);

  return {
    mockClearRoster,
    mockSetRoster,
    mockShowItemNow,
    mockCreateQueue,
    mockDeleteQueue,
    mockAddItemsToQueue,
  };
}

describe("TeamAssetController", () => {
  let mockPreviousView: Mock<() => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPreviousView = vi.fn<() => void>();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial render", () => {
    it("shows team selection message when no teams selected", () => {
      setupMocks({ match: { homeTeam: "", awayTeam: "" } });

      render(<TeamAssetController previousView={mockPreviousView} />);

      expect(screen.getByText("Veldu lið fyrst")).toBeInTheDocument();
    });

    it("shows team selection message when homeTeam is empty", () => {
      setupMocks({ match: { homeTeam: "" } });

      render(<TeamAssetController previousView={mockPreviousView} />);

      expect(screen.getByText("Veldu lið fyrst")).toBeInTheDocument();
    });

    it("renders team components when teams are selected", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      expect(screen.getByTestId("team-homeTeam")).toBeInTheDocument();
      expect(screen.getByTestId("team-awayTeam")).toBeInTheDocument();
    });

    it('shows "Sækja lið" button when ksiMatchId is set', () => {
      setupMocks();

      render(<TeamAssetController previousView={mockPreviousView} />);

      expect(
        screen.getByRole("button", { name: "Sækja lið" }),
      ).toBeInTheDocument();
    });

    it('shows "Hreinsa lið" and per-team "Setja lið í biðröð" when players are loaded', () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      expect(
        screen.getByRole("button", { name: "Hreinsa lið" }),
      ).toBeInTheDocument();
      expect(
        screen.getAllByRole("button", { name: "Setja lið í biðröð" }),
      ).toHaveLength(2);
    });

    it('hides "Sækja lið" button when ksiMatchId is undefined', () => {
      setupMocks({ match: { ksiMatchId: undefined } });

      render(<TeamAssetController previousView={mockPreviousView} />);

      expect(
        screen.queryByRole("button", { name: "Sækja lið" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("refetchRoster / fetch lineups by ksiMatchId", () => {
    it("calls fetchLineups with teamId and ksiMatchId directly", async () => {
      const { mockSetRoster } = setupMocks();
      const rosterData: Roster = {
        home: [{ name: "Jón", id: 1 }],
        away: [{ name: "Gunnar", id: 2 }],
      };
      const lineups = {
        home: { players: [], officials: [] },
        away: { players: [], officials: [] },
      };

      mockedGetLineups.mockResolvedValueOnce({
        data: lineups,
        error: undefined,
      } as unknown as Awaited<ReturnType<typeof getLineups>>);
      mockedTransformLineups.mockReturnValueOnce(rosterData);

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Sækja lið" }));

      expect(screen.getByTestId("ring-loader")).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByTestId("ring-loader")).not.toBeInTheDocument();
      });

      expect(mockedGetLineups).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.objectContaining({
            teamId: 2492,
            matchId: 12345,
          }) as unknown,
        }),
      );
      expect(mockedTransformLineups).toHaveBeenCalledWith(lineups);
      expect(mockSetRoster).toHaveBeenCalledWith(rosterData);
    });

    it("shows error on API failure", async () => {
      setupMocks();

      mockedGetLineups.mockRejectedValueOnce(new Error("Network error"));

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Sækja lið" }));

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });

    it("does not fetch when ksiMatchId is undefined", () => {
      setupMocks({ match: { ksiMatchId: undefined } });

      render(<TeamAssetController previousView={mockPreviousView} />);

      expect(
        screen.queryByRole("button", { name: "Sækja lið" }),
      ).not.toBeInTheDocument();
      expect(mockedGetLineups).not.toHaveBeenCalled();
    });
  });

  describe("clear match players", () => {
    it("calls clearRoster when confirmed", () => {
      const { mockClearRoster } = setupMocks({ roster: mockRoster });

      vi.spyOn(window, "confirm").mockReturnValue(true);

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Hreinsa lið" }));

      expect(window.confirm).toHaveBeenCalledWith("Ertu alveg viss?");
      expect(mockClearRoster).toHaveBeenCalledTimes(1);
    });

    it("does not call clearRoster when cancelled", () => {
      const { mockClearRoster } = setupMocks({ roster: mockRoster });

      vi.spyOn(window, "confirm").mockReturnValue(false);

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Hreinsa lið" }));

      expect(window.confirm).toHaveBeenCalledWith("Ertu alveg viss?");
      expect(mockClearRoster).not.toHaveBeenCalled();
    });
  });

  describe("add players to queue", () => {
    it("adds visible home team players to queue named after team and calls previousView", async () => {
      const { mockCreateQueue, mockAddItemsToQueue } = setupMocks({
        roster: mockRoster,
      });

      const mockAsset = {
        type: "PLAYER",
        key: "player-key",
        name: "Jón",
        number: 10,
      };
      mockedGetPlayerAssetObject.mockReturnValue(
        mockAsset as unknown as ReturnType<typeof getPlayerAssetObject>,
      );

      render(<TeamAssetController previousView={mockPreviousView} />);

      const queueButtons = screen.getAllByRole("button", {
        name: "Setja lið í biðröð",
      });
      fireEvent.click(queueButtons[0]);

      await waitFor(() => {
        expect(mockCreateQueue).toHaveBeenCalledWith("Víkingur R");
        expect(mockAddItemsToQueue).toHaveBeenCalled();
        expect(mockPreviousView).toHaveBeenCalled();
      });
    });

    it("shows error when some players have missing name or id", () => {
      const playersWithMissingData: Player[] = [
        ...mockPlayers,
        { name: "", id: 999, number: 99, role: "midfielder", show: true },
      ];
      const rosterWithBadPlayers: Roster = {
        home: playersWithMissingData,
        away: mockAwayPlayers,
      };

      const { mockAddItemsToQueue } = setupMocks({
        roster: rosterWithBadPlayers,
      });

      render(<TeamAssetController previousView={mockPreviousView} />);

      const queueButtons = screen.getAllByRole("button", {
        name: "Setja lið í biðröð",
      });
      fireEvent.click(queueButtons[0]);

      expect(
        screen.getByText("Missing name/number for some players to show"),
      ).toBeInTheDocument();
      expect(mockAddItemsToQueue).not.toHaveBeenCalled();
      expect(mockPreviousView).not.toHaveBeenCalled();
    });
  });

  describe("action buttons", () => {
    it("renders action buttons when players are loaded", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      expect(
        screen.getByRole("button", { name: "Skipting" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Birta leikmann" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Birta markaskorara" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Birta mann leiksins" }),
      ).toBeInTheDocument();
    });

    it("shows effect selector with default blink value", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      const select = screen.getByDisplayValue("Blink");
      expect(select).toBeInTheDocument();
    });

    it("allows changing the effect", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      const select = screen.getByDisplayValue("Blink");
      fireEvent.change(select, { target: { value: "shaker" } });

      expect(screen.getByDisplayValue("Shaker")).toBeInTheDocument();
    });
  });

  describe("substitution flow", () => {
    it("enters sub mode and shows cancel button", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));

      expect(
        screen.getByRole("button", { name: "Hætta við skiptingu" }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("sub-view")).toBeInTheDocument();
    });

    it("cancels sub mode when cancel button clicked", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(
        screen.getByRole("button", { name: "Hætta við skiptingu" }),
      );

      expect(
        screen.getByRole("button", { name: "Skipting" }),
      ).toBeInTheDocument();
    });

    it("enables player selection on Team components during sub mode", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));

      expect(screen.getByTestId("select-player-homeTeam")).toBeInTheDocument();
      expect(screen.getByTestId("select-player-awayTeam")).toBeInTheDocument();
    });

    it("selects first sub player (subIn) and shows SubView", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      expect(screen.getByTestId("sub-in")).toBeInTheDocument();
      expect(screen.getByTestId("sub-team")).toHaveTextContent("Víkingur R");
    });

    it("completes substitution flow when both players selected", async () => {
      const { mockShowItemNow } = setupMocks({ roster: mockRoster });

      const subInAsset = {
        type: "PLAYER",
        key: "sub-in-key",
        name: "Jón",
        number: 10,
      };
      const subOutAsset = {
        type: "PLAYER",
        key: "sub-out-key",
        name: "Jón",
        number: 10,
      };
      mockedGetPlayerAssetObject
        .mockResolvedValueOnce(
          subInAsset as unknown as Awaited<
            ReturnType<typeof getPlayerAssetObject>
          >,
        )
        .mockResolvedValueOnce(
          subOutAsset as unknown as Awaited<
            ReturnType<typeof getPlayerAssetObject>
          >,
        );

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      await waitFor(() => {
        expect(mockShowItemNow).toHaveBeenCalled();
      });

      const callArgs = mockShowItemNow.mock.calls[0]!;
      expect(callArgs[0]).toEqual(
        expect.objectContaining({
          type: "SUB",
          subIn: subInAsset,
          subOut: subOutAsset,
        }),
      );
    });

    it("does not call showItemNow if getPlayerAssetObject returns null for subIn", async () => {
      const { mockShowItemNow } = setupMocks({ roster: mockRoster });

      mockedGetPlayerAssetObject.mockResolvedValue(null);

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      await waitFor(() => {
        expect(mockedGetPlayerAssetObject).toHaveBeenCalled();
      });

      expect(mockShowItemNow).not.toHaveBeenCalled();
    });
  });

  describe("select player asset", () => {
    it("enters player asset mode and shows cancel button", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));

      expect(
        screen.getByRole("button", { name: "Hætta við birtingu" }),
      ).toBeInTheDocument();
    });

    it("cancels player asset mode", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));
      fireEvent.click(
        screen.getByRole("button", { name: "Hætta við birtingu" }),
      );

      expect(
        screen.getByRole("button", { name: "Birta leikmann" }),
      ).toBeInTheDocument();
    });

    it("selects a player and calls showItemNow", async () => {
      const { mockShowItemNow } = setupMocks({ roster: mockRoster });

      const playerAsset = {
        type: "PLAYER",
        key: "player-key",
        name: "Jón",
        number: 10,
      };
      mockedGetPlayerAssetObject.mockResolvedValue(
        playerAsset as unknown as Awaited<
          ReturnType<typeof getPlayerAssetObject>
        >,
      );

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      await waitFor(() => {
        expect(mockShowItemNow).toHaveBeenCalledWith(playerAsset);
      });
    });

    it("uses actual team name (not homeTeam/awayTeam key) for player asset", () => {
      setupMocks({ roster: mockRoster });

      mockedGetPlayerAssetObject.mockResolvedValue(
        {} as unknown as Awaited<ReturnType<typeof getPlayerAssetObject>>,
      );

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      expect(mockedGetPlayerAssetObject).toHaveBeenCalledWith(
        expect.objectContaining({
          teamName: "Víkingur R",
          listenPrefix: "vikinni",
        }),
      );
    });

    it("uses away team name for away player asset", () => {
      setupMocks({ roster: mockRoster });

      mockedGetPlayerAssetObject.mockResolvedValue(
        {} as unknown as Awaited<ReturnType<typeof getPlayerAssetObject>>,
      );

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));
      fireEvent.click(screen.getByTestId("select-player-awayTeam"));

      expect(mockedGetPlayerAssetObject).toHaveBeenCalledWith(
        expect.objectContaining({
          teamName: "KR",
          listenPrefix: "vikinni",
        }),
      );
    });
  });

  describe("select goal scorer", () => {
    it("enters goal scorer mode and shows cancel button", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Birta markaskorara" }),
      );

      expect(
        screen.getByRole("button", { name: "Hætta við birtingu" }),
      ).toBeInTheDocument();
    });

    it("selects goal scorer with overlay effect", async () => {
      const { mockShowItemNow } = setupMocks({ roster: mockRoster });

      const playerAsset = {
        type: "PLAYER",
        key: "player-key",
        name: "Jón",
        number: 10,
      };
      mockedGetPlayerAssetObject.mockResolvedValue(
        playerAsset as unknown as Awaited<
          ReturnType<typeof getPlayerAssetObject>
        >,
      );

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Birta markaskorara" }),
      );
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      expect(mockedGetPlayerAssetObject).toHaveBeenCalledWith(
        expect.objectContaining({
          overlay: { text: "", blink: true, effect: "blink" },
        }),
      );
      await waitFor(() => {
        expect(mockShowItemNow).toHaveBeenCalledWith(playerAsset);
      });
    });

    it("uses selected effect for goal scorer overlay", () => {
      setupMocks({ roster: mockRoster });

      mockedGetPlayerAssetObject.mockResolvedValue(
        {} as unknown as Awaited<ReturnType<typeof getPlayerAssetObject>>,
      );

      render(<TeamAssetController previousView={mockPreviousView} />);

      const select = screen.getByDisplayValue("Blink");
      fireEvent.change(select, { target: { value: "shaker" } });

      fireEvent.click(
        screen.getByRole("button", { name: "Birta markaskorara" }),
      );
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      expect(mockedGetPlayerAssetObject).toHaveBeenCalledWith(
        expect.objectContaining({
          overlay: { text: "", blink: true, effect: "shaker" },
        }),
      );
    });
  });

  describe("select MOTM", () => {
    it("enters MOTM mode and shows cancel button", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Birta mann leiksins" }),
      );

      expect(
        screen.getByRole("button", { name: "Hætta við birtingu" }),
      ).toBeInTheDocument();
    });

    it("selects MOTM and calls getMOTMAsset", async () => {
      const { mockShowItemNow } = setupMocks({ roster: mockRoster });

      const motmAsset = {
        type: "MOTM",
        key: "motm-key",
        name: "Jón",
        number: 10,
      };
      mockedGetMOTMAsset.mockResolvedValue(
        motmAsset as unknown as Awaited<ReturnType<typeof getMOTMAsset>>,
      );

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Birta mann leiksins" }),
      );
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      expect(mockedGetMOTMAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          teamName: "Víkingur R",
          listenPrefix: "vikinni",
        }),
      );
      await waitFor(() => {
        expect(mockShowItemNow).toHaveBeenCalledWith(motmAsset);
      });
    });
  });

  describe("loading state", () => {
    it("shows spinner during data loading", () => {
      setupMocks();

      const neverResolves = new Promise<never>(
        Function.prototype as () => void,
      );
      mockedGetLineups.mockReturnValue(neverResolves);

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Sækja lið" }));

      expect(screen.getByTestId("ring-loader")).toBeInTheDocument();
    });

    it("hides controls while loading", () => {
      setupMocks();

      const neverResolves = new Promise<never>(
        Function.prototype as () => void,
      );
      mockedGetLineups.mockReturnValue(neverResolves);

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Sækja lið" }));

      expect(
        screen.queryByRole("button", { name: "Sækja lið" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("renderTeam selectPlayer behavior", () => {
    it("does not pass selectPlayer to Team when no action is selected", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      expect(
        screen.queryByTestId("select-player-homeTeam"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("select-player-awayTeam"),
      ).not.toBeInTheDocument();
    });

    it("passes selectPlayer to both teams in player asset mode", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));

      expect(screen.getByTestId("select-player-homeTeam")).toBeInTheDocument();
      expect(screen.getByTestId("select-player-awayTeam")).toBeInTheDocument();
    });

    it("passes selectPlayer to both teams in goal scorer mode", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Birta markaskorara" }),
      );

      expect(screen.getByTestId("select-player-homeTeam")).toBeInTheDocument();
      expect(screen.getByTestId("select-player-awayTeam")).toBeInTheDocument();
    });

    it("passes selectPlayer to both teams in MOTM mode", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Birta mann leiksins" }),
      );

      expect(screen.getByTestId("select-player-homeTeam")).toBeInTheDocument();
      expect(screen.getByTestId("select-player-awayTeam")).toBeInTheDocument();
    });
  });

  describe("cancel display mode", () => {
    it("cancels goal scorer mode from cancel button", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Birta markaskorara" }),
      );
      expect(
        screen.getByRole("button", { name: "Hætta við birtingu" }),
      ).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: "Hætta við birtingu" }),
      );

      expect(
        screen.getByRole("button", { name: "Skipting" }),
      ).toBeInTheDocument();
    });

    it("cancels MOTM mode from cancel button", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Birta mann leiksins" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Hætta við birtingu" }),
      );

      expect(
        screen.getByRole("button", { name: "Skipting" }),
      ).toBeInTheDocument();
    });
  });

  describe("SubView during substitution", () => {
    it("shows correct team name in SubView for home team sub", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));

      expect(screen.queryByTestId("sub-team")).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      expect(screen.getByTestId("sub-team")).toHaveTextContent("Víkingur R");
    });

    it("shows correct team name in SubView for away team sub", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(screen.getByTestId("select-player-awayTeam"));

      expect(screen.getByTestId("sub-team")).toHaveTextContent("KR");
    });
  });

  describe("getTeamPlayers with no selected match", () => {
    it("renders with empty players when roster is empty", () => {
      setupMocks();

      render(<TeamAssetController previousView={mockPreviousView} />);

      expect(
        screen.getByRole("button", { name: "Sækja lið" }),
      ).toBeInTheDocument();
    });
  });

  describe("clearState after actions", () => {
    it("returns to default action buttons after selecting a player asset", async () => {
      setupMocks({ roster: mockRoster });

      mockedGetPlayerAssetObject.mockResolvedValue(
        {} as unknown as Awaited<ReturnType<typeof getPlayerAssetObject>>,
      );

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));
      expect(
        screen.getByRole("button", { name: "Hætta við birtingu" }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Skipting" }),
        ).toBeInTheDocument();
      });
    });

    it("returns to default action buttons after selecting a goal scorer", async () => {
      setupMocks({ roster: mockRoster });

      mockedGetPlayerAssetObject.mockResolvedValue(
        {} as unknown as Awaited<ReturnType<typeof getPlayerAssetObject>>,
      );

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Birta markaskorara" }),
      );
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Skipting" }),
        ).toBeInTheDocument();
      });
    });

    it("returns to default action buttons after selecting MOTM", async () => {
      setupMocks({ roster: mockRoster });

      mockedGetMOTMAsset.mockResolvedValue(
        {} as unknown as Awaited<ReturnType<typeof getMOTMAsset>>,
      );

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Birta mann leiksins" }),
      );
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Skipting" }),
        ).toBeInTheDocument();
      });
    });
  });
});
