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
  useView,
} from "../../../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../../../contexts/LocalStateContext";
import { transformLineups } from "../../../lib/matchUtils";
import { getLineups } from "../../../api/client";
import { parseLocations } from "../../../contexts/firebaseParsers";

vi.mock("../../../contexts/FirebaseStateContext", () => ({
  useMatch: vi.fn(),
  useController: vi.fn(),
  useListeners: vi.fn(),
  useView: vi.fn(),
}));

vi.mock("../../../contexts/LocalStateContext", () => ({
  useRemoteSettings: vi.fn(),
}));

vi.mock("../../../api/client", () => ({
  getLineups: vi.fn(),
}));

vi.mock("../../../lib/matchUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/matchUtils")>()),
  transformLineups: vi.fn(),
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

vi.mock("./TeamPlayerSelectionModal", () => ({
  default: ({
    open,
    onClose,
    title,
    instruction,
    players,
    onSelect,
  }: {
    open: boolean;
    onClose: () => void;
    title: string;
    instruction?: string;
    players: Player[];
    onSelect: (player: Player) => void;
  }) =>
    open ? (
      <div data-testid="player-select-modal">
        <div data-testid="player-select-title">{title}</div>
        {instruction ? (
          <div data-testid="player-select-instruction">{instruction}</div>
        ) : null}
        <button type="button" onClick={onClose}>
          Close modal
        </button>
        {players.map((player) => (
          <button
            key={`${String(player.number)}-${player.name}`}
            type="button"
            data-testid={`modal-player-${player.name}`}
            onClick={() => onSelect(player)}
          >
            {player.name}
          </button>
        ))}
      </div>
    ) : null,
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
const mockedUseView = vi.mocked(useView);
const mockedUseRemoteSettings = vi.mocked(useRemoteSettings);
const mockedGetLineups = vi.mocked(getLineups);
const mockedTransformLineups = vi.mocked(transformLineups);
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
  {
    name: "Siggi Bekkur",
    id: 104,
    number: 12,
    role: "midfielder",
    show: false,
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
  {
    name: "Arnar Bekkur",
    id: 203,
    number: 14,
    role: "defender",
    show: false,
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
  halftimeCountdown: false,
  injuryTimeDisplayMode: "full",
  ksiMatchId: 12345,
};

function setupMocks(overrides?: {
  match?: Partial<typeof defaultMatch>;
  roster?: Roster;
  view?: Record<string, unknown>;
}) {
  const mockClearRoster = vi.fn();
  const mockSetRoster = vi.fn();
  const mockShowItemNow = vi.fn().mockResolvedValue(undefined);
  const mockAppendSubstitutionAndActivate = vi
    .fn()
    .mockResolvedValue(undefined);
  const mockReplaceQueue = vi.fn().mockResolvedValue("replacement-id");
  const mockEditPlayer = vi.fn();
  const mockActivateQueue = vi.fn();
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
    renderAsset: mockShowItemNow,
    appendSubstitutionAndActivate: mockAppendSubstitutionAndActivate,
    replaceQueue: mockReplaceQueue,
    editPlayer: mockEditPlayer,
    createQueue: mockCreateQueue,
    deleteQueue: mockDeleteQueue,
    addItemsToQueue: mockAddItemsToQueue,
    activateQueue: mockActivateQueue,
  } as unknown as ReturnType<typeof useController>);

  mockedUseRemoteSettings.mockReturnValue({
    listenPrefix: "vikinni",
  } as unknown as ReturnType<typeof useRemoteSettings>);

  mockedUseListeners.mockReturnValue({
    venues: {
      vikinni: { label: "vikinni", pitchIds: [], config: {}, screens: {} },
    },
    screens: [{ key: "vikinni", teamId: 2492 }],
  } as unknown as ReturnType<typeof useListeners>);

  mockedUseView.mockReturnValue({
    view: overrides?.view ?? {},
    setGoalGifSettings: vi.fn(),
  } as unknown as ReturnType<typeof useView>);

  return {
    mockClearRoster,
    mockSetRoster,
    mockShowItemNow,
    mockAppendSubstitutionAndActivate,
    mockReplaceQueue,
    mockEditPlayer,
    mockCreateQueue,
    mockDeleteQueue,
    mockAddItemsToQueue,
    mockActivateQueue,
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
    it("uses the configured venue ID for roster refetch without scoreboard screens", async () => {
      setupMocks();
      mockedUseListeners.mockReturnValue(
        parseLocations({
          another: { config: { homeTeam: 2390 } },
          vikinni: { config: { homeTeam: "2058" } },
        })!,
      );
      mockedGetLineups.mockResolvedValueOnce({
        data: { home: {}, away: {} },
      } as unknown as Awaited<ReturnType<typeof getLineups>>);
      mockedTransformLineups.mockReturnValue({ home: [], away: [] });
      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(screen.getByRole("button", { name: "Sækja lið" }));

      await waitFor(() =>
        expect(mockedGetLineups).toHaveBeenCalledExactlyOnceWith({
          path: { teamId: 2058, matchId: 12345 },
        }),
      );
    });

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
    it.each(["null", "rejected", "save"])(
      "keeps the team view and old queue on %s preparation/submission failure",
      async (failure) => {
        const {
          mockReplaceQueue,
          mockDeleteQueue,
          mockCreateQueue,
          mockAddItemsToQueue,
        } = setupMocks({ roster: mockRoster });
        if (failure === "null")
          mockedGetPlayerAssetObject.mockResolvedValue(null);
        else if (failure === "rejected")
          mockedGetPlayerAssetObject.mockRejectedValue(
            new Error("Media preparation failed"),
          );
        else {
          mockedGetPlayerAssetObject.mockResolvedValue({
            type: "PLAYER",
            key: "ready",
            name: "Jón",
            overlay: { text: "" },
            teamName: "Víkingur R",
          });
          mockReplaceQueue.mockRejectedValue(new Error("Queue save failed"));
        }
        render(<TeamAssetController previousView={mockPreviousView} />);
        fireEvent.click(
          screen.getAllByRole("button", { name: "Setja lið í biðröð" })[0],
        );
        await waitFor(() =>
          expect(document.querySelector(".error")).not.toHaveTextContent(/^$/),
        );
        expect(mockDeleteQueue).not.toHaveBeenCalled();
        expect(mockCreateQueue).not.toHaveBeenCalled();
        expect(mockAddItemsToQueue).not.toHaveBeenCalled();
        if (failure !== "save") expect(mockReplaceQueue).not.toHaveBeenCalled();
        expect(mockPreviousView).not.toHaveBeenCalled();
      },
    );

    it("prepares all team media before any queue mutation", async () => {
      const { mockCreateQueue, mockDeleteQueue, mockAddItemsToQueue } =
        setupMocks({ roster: mockRoster });
      mockedGetPlayerAssetObject.mockReturnValue(new Promise(() => undefined));
      render(<TeamAssetController previousView={mockPreviousView} />);
      fireEvent.click(
        screen.getAllByRole("button", { name: "Setja lið í biðröð" })[0],
      );
      await waitFor(() =>
        expect(mockedGetPlayerAssetObject).toHaveBeenCalledTimes(3),
      );
      expect(mockCreateQueue).not.toHaveBeenCalled();
      expect(mockDeleteQueue).not.toHaveBeenCalled();
      expect(mockAddItemsToQueue).not.toHaveBeenCalled();
      expect(mockPreviousView).not.toHaveBeenCalled();
    });

    it("adds visible home team players to queue named after team and calls previousView", async () => {
      const { mockReplaceQueue } = setupMocks({
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
        expect(mockReplaceQueue).toHaveBeenCalledWith(
          "Víkingur R",
          expect.arrayContaining([
            expect.objectContaining({ key: "player-key" }),
          ]),
          {
            cycle: false,
          },
        );
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

      expect(screen.getAllByRole("button", { name: "Skipting" })).toHaveLength(
        2,
      );
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
  });

  describe("substitution flow", () => {
    it("opens sub modal and shows starter instruction", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      const subButtons = screen.getAllByRole("button", { name: "Skipting" });
      fireEvent.click(subButtons[0]);

      expect(screen.getByTestId("player-select-modal")).toBeInTheDocument();
      expect(screen.getByTestId("player-select-instruction")).toHaveTextContent(
        "Veldu leikmann sem fer AF velli",
      );
    });

    it("closes sub modal when close button clicked", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      const subButtons = screen.getAllByRole("button", { name: "Skipting" });
      fireEvent.click(subButtons[0]);
      fireEvent.click(screen.getByRole("button", { name: "Close modal" }));

      expect(
        screen.queryByTestId("player-select-modal"),
      ).not.toBeInTheDocument();
    });

    it("shows sub modal players for the selected team", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      const subButtons = screen.getAllByRole("button", { name: "Skipting" });
      fireEvent.click(subButtons[0]);

      expect(
        screen.getByTestId("modal-player-Jón Jónsson"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("modal-player-Gunnar Gunnarsson"),
      ).not.toBeInTheDocument();
    });

    it("selects sub off player and advances modal instruction", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      const subButtons = screen.getAllByRole("button", { name: "Skipting" });
      fireEvent.click(subButtons[0]);
      fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));

      expect(screen.getByTestId("player-select-instruction")).toHaveTextContent(
        "veldu leikmann sem kemur INN",
      );
    });

    it("completes substitution flow when both players selected", async () => {
      const { mockAppendSubstitutionAndActivate } = setupMocks({
        roster: mockRoster,
      });

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

      const subButtons = screen.getAllByRole("button", { name: "Skipting" });
      fireEvent.click(subButtons[0]);
      fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));
      fireEvent.click(screen.getByTestId("modal-player-Siggi Bekkur"));

      await waitFor(() =>
        expect(mockAppendSubstitutionAndActivate).toHaveBeenCalledTimes(1),
      );

      expect(mockAppendSubstitutionAndActivate).toHaveBeenCalledWith({
        side: "home",
        outgoing: mockPlayers[0],
        incoming: mockPlayers[3],
        asset: {
          key: "sub-sub-in-key-sub-out-key",
          type: "SUB",
          // Corrected semantics: subIn = coming on, subOut = going off.
          // The first modal step picks the outgoing player (Jón Jónsson),
          // the second the incoming player (Siggi Bekkur).
          subIn: { ...subInAsset, fullName: "Siggi Bekkur" },
          subOut: { ...subOutAsset, fullName: "Jón Jónsson" },
        },
      });
    });

    it("does not add to queue if getPlayerAssetObject returns null for subIn", async () => {
      const { mockAddItemsToQueue } = setupMocks({ roster: mockRoster });

      mockedGetPlayerAssetObject.mockResolvedValue(null);

      render(<TeamAssetController previousView={mockPreviousView} />);

      const subButtons = screen.getAllByRole("button", { name: "Skipting" });
      fireEvent.click(subButtons[0]);
      fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));
      fireEvent.click(screen.getByTestId("modal-player-Siggi Bekkur"));

      await waitFor(() => {
        expect(mockedGetPlayerAssetObject).toHaveBeenCalled();
      });

      expect(mockAddItemsToQueue).not.toHaveBeenCalled();
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
    it("opens goal scorer modal with instruction", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Birta markaskorara" }),
      );

      expect(screen.getByTestId("player-select-modal")).toBeInTheDocument();
      expect(screen.getByTestId("player-select-instruction")).toHaveTextContent(
        "Veldu leikmann sem skoraði",
      );
    });

    it("selects goal scorer with isGoalCelebration flag", async () => {
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
      fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));

      expect(mockedGetPlayerAssetObject).toHaveBeenCalledWith(
        expect.objectContaining({
          teamName: "Víkingur R",
          listenPrefix: "vikinni",
        }),
      );
      await waitFor(() => {
        expect(mockShowItemNow).toHaveBeenCalledWith({
          ...playerAsset,
          isGoalCelebration: true,
        });
      });
    });

    it("selects goal scorer with goalGif2 background", async () => {
      const { mockShowItemNow } = setupMocks({
        roster: mockRoster,
        view: { goalGif1: "gif1.gif", goalGif2: "gif2.mp4" },
      });

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
      fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));

      await waitFor(() => {
        expect(mockShowItemNow).toHaveBeenCalledWith({
          ...playerAsset,
          isGoalCelebration: true,
          background: "gif2.mp4",
        });
      });
    });

    it("uses goalGif1 as background when goalGifSameImage is true", async () => {
      const { mockShowItemNow } = setupMocks({
        roster: mockRoster,
        view: {
          goalGif1: "gif1.gif",
          goalGif2: "gif2.mp4",
          goalGifSameImage: true,
        },
      });

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
      fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));

      await waitFor(() => {
        expect(mockShowItemNow).toHaveBeenCalledWith({
          ...playerAsset,
          isGoalCelebration: true,
          background: "gif1.gif",
        });
      });
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

    it("does not pass selectPlayer to Team in goal scorer mode", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Birta markaskorara" }),
      );

      expect(
        screen.queryByTestId("select-player-homeTeam"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("select-player-awayTeam"),
      ).not.toBeInTheDocument();
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
    it("closes goal scorer modal from close button", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Birta markaskorara" }),
      );
      expect(screen.getByTestId("player-select-modal")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Close modal" }));

      expect(
        screen.queryByTestId("player-select-modal"),
      ).not.toBeInTheDocument();
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

      expect(screen.getAllByRole("button", { name: "Skipting" })).toHaveLength(
        2,
      );
    });
  });

  describe("substitution modal content", () => {
    it("shows home team name in modal title for home sub", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      const subButtons = screen.getAllByRole("button", { name: "Skipting" });
      fireEvent.click(subButtons[0]);

      expect(screen.getByTestId("player-select-title")).toHaveTextContent(
        "Skipting – Víkingur R",
      );
    });

    it("shows away team name in modal title for away sub", () => {
      setupMocks({ roster: mockRoster });

      render(<TeamAssetController previousView={mockPreviousView} />);

      const subButtons = screen.getAllByRole("button", { name: "Skipting" });
      fireEvent.click(subButtons[1]);

      expect(screen.getByTestId("player-select-title")).toHaveTextContent(
        "Skipting – KR",
      );
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
          screen.getAllByRole("button", { name: "Skipting" }),
        ).toHaveLength(2);
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
      fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));

      await waitFor(() => {
        expect(
          screen.getAllByRole("button", { name: "Skipting" }),
        ).toHaveLength(2);
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
          screen.getAllByRole("button", { name: "Skipting" }),
        ).toHaveLength(2);
      });
    });
  });
});
