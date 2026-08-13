import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HomeTeamQuickActions from "./HomeTeamQuickActions";
import { Player, Roster } from "../types";
import {
  useController,
  useMatch,
  useView,
} from "../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../contexts/LocalStateContext";
import { getMOTMAsset, getPlayerAssetObject } from "./asset/team/assetHelpers";

vi.mock("../contexts/FirebaseStateContext", () => ({
  useController: vi.fn(),
  useMatch: vi.fn(),
  useView: vi.fn(),
}));

vi.mock("../contexts/LocalStateContext", () => ({
  useRemoteSettings: vi.fn(),
}));

vi.mock("./asset/team/TeamPlayerSelectionModal", () => ({
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

vi.mock("./asset/team/assetHelpers", () => ({
  getPlayerAssetObject: vi.fn(),
  getMOTMAsset: vi.fn(),
}));

const mockedUseController = vi.mocked(useController);
const mockedUseMatch = vi.mocked(useMatch);
const mockedUseView = vi.mocked(useView);
const mockedUseRemoteSettings = vi.mocked(useRemoteSettings);
const mockedGetPlayerAssetObject = vi.mocked(getPlayerAssetObject);
const mockedGetMOTMAsset = vi.mocked(getMOTMAsset);

const mockHomePlayers: Player[] = [
  { name: "Jón Jónsson", id: 101, number: 10, role: "midfielder", show: true },
  { name: "Ólafur Ólafsson", id: 102, number: 7, role: "forward", show: true },
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
];

const mockRoster: Roster = {
  home: mockHomePlayers,
  away: mockAwayPlayers,
};

function setupMocks(overrides?: {
  roster?: Roster;
  view?: Record<string, unknown>;
}) {
  const mockShowItemNow = vi.fn();
  const mockEditPlayer = vi.fn();
  const mockCreateQueue = vi
    .fn<(name: string) => string>()
    .mockReturnValue("new-queue-id");
  const mockAddItemsToQueue = vi.fn();
  const mockActivateQueue = vi.fn();

  mockedUseController.mockReturnValue({
    controller: {
      roster: overrides?.roster ?? { home: [], away: [] },
      queues: {},
    },
    showItemNow: mockShowItemNow,
    editPlayer: mockEditPlayer,
    createQueue: mockCreateQueue,
    addItemsToQueue: mockAddItemsToQueue,
    activateQueue: mockActivateQueue,
  } as unknown as ReturnType<typeof useController>);

  mockedUseMatch.mockReturnValue({
    match: { homeTeam: "Víkingur R", awayTeam: "KR" },
  } as unknown as ReturnType<typeof useMatch>);

  mockedUseView.mockReturnValue({
    view: overrides?.view ?? {},
  } as unknown as ReturnType<typeof useView>);

  mockedUseRemoteSettings.mockReturnValue({
    listenPrefix: "vikinni",
  } as unknown as ReturnType<typeof useRemoteSettings>);

  return {
    mockShowItemNow,
    mockEditPlayer,
    mockCreateQueue,
    mockAddItemsToQueue,
    mockActivateQueue,
  };
}

describe("HomeTeamQuickActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("box placement and home-team scoping", () => {
    it("renders the Heimalið aðgerðir box with all three actions when a home roster is available", () => {
      setupMocks({ roster: mockRoster });

      render(<HomeTeamQuickActions />);

      expect(screen.getByText("Heimalið aðgerðir")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Skipting" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Birta leikmann" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Maður leiksins" }),
      ).toBeInTheDocument();
    });

    it("renders nothing when no home roster is available", () => {
      setupMocks();

      render(<HomeTeamQuickActions />);

      expect(screen.queryByText("Heimalið aðgerðir")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Skipting" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("substitution quick action", () => {
    it("opens the substitution modal with only on-pitch home players", () => {
      setupMocks({ roster: mockRoster });

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));

      expect(screen.getByTestId("player-select-title")).toHaveTextContent(
        "Skipting – Víkingur R",
      );
      expect(screen.getByTestId("player-select-instruction")).toHaveTextContent(
        "Veldu leikmann sem fer AF velli",
      );
      expect(
        screen.getByTestId("modal-player-Jón Jónsson"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("modal-player-Siggi Bekkur"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("modal-player-Gunnar Gunnarsson"),
      ).not.toBeInTheDocument();
    });

    it("lists only eligible off-pitch home players in the second step", () => {
      setupMocks({ roster: mockRoster });

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));

      expect(screen.getByTestId("player-select-instruction")).toHaveTextContent(
        "veldu leikmann sem kemur INN",
      );
      expect(
        screen.getByTestId("modal-player-Siggi Bekkur"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("modal-player-Ólafur Ólafsson"),
      ).not.toBeInTheDocument();
    });

    it("records the substitution and updates player status when both steps complete", async () => {
      const {
        mockEditPlayer,
        mockCreateQueue,
        mockAddItemsToQueue,
        mockActivateQueue,
      } = setupMocks({ roster: mockRoster });

      const subInAsset = {
        type: "PLAYER",
        key: "sub-in-key",
        name: "Jón",
        number: 10,
      };
      const subOutAsset = {
        type: "PLAYER",
        key: "sub-out-key",
        name: "Siggi",
        number: 12,
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

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(screen.getByTestId("modal-player-Jón Jónsson"));
      fireEvent.click(screen.getByTestId("modal-player-Siggi Bekkur"));

      expect(mockEditPlayer).toHaveBeenCalledWith("home", 0, {
        show: false,
      });
      expect(mockEditPlayer).toHaveBeenCalledWith("home", 2, { show: true });

      await waitFor(() => {
        expect(mockCreateQueue).toHaveBeenCalledWith("Skiptingar", {
          cycle: false,
        });
      });

      expect(mockAddItemsToQueue).toHaveBeenCalledWith("new-queue-id", [
        expect.objectContaining({
          type: "SUB",
          subIn: { ...subInAsset, fullName: "Jón Jónsson" },
          subOut: { ...subOutAsset, fullName: "Siggi Bekkur" },
        }),
      ]);
      expect(mockActivateQueue).toHaveBeenCalledWith("new-queue-id");
    });
  });

  describe("player-card quick action", () => {
    it("opens the modal with the complete home roster including substituted-off players", () => {
      setupMocks({ roster: mockRoster });

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));

      expect(
        screen.getByTestId("modal-player-Jón Jónsson"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("modal-player-Siggi Bekkur"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("modal-player-Gunnar Gunnarsson"),
      ).not.toBeInTheDocument();
    });

    it("displays the player card when a substituted-off home player is selected", async () => {
      const { mockShowItemNow } = setupMocks({ roster: mockRoster });

      const playerAsset = {
        type: "PLAYER",
        key: "player-key",
        name: "Siggi",
        number: 12,
      };
      mockedGetPlayerAssetObject.mockResolvedValue(
        playerAsset as unknown as Awaited<
          ReturnType<typeof getPlayerAssetObject>
        >,
      );

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));
      fireEvent.click(screen.getByTestId("modal-player-Siggi Bekkur"));

      expect(mockedGetPlayerAssetObject).toHaveBeenCalledWith(
        expect.objectContaining({
          player: expect.objectContaining({ name: "Siggi Bekkur" }) as unknown,
          teamName: "Víkingur R",
          listenPrefix: "vikinni",
        }),
      );
      await waitFor(() => {
        expect(mockShowItemNow).toHaveBeenCalledWith(playerAsset);
      });
    });
  });

  describe("man-of-the-match quick action", () => {
    it("opens the modal with the complete home roster including substituted-off players", () => {
      setupMocks({ roster: mockRoster });

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Maður leiksins" }));

      expect(
        screen.getByTestId("modal-player-Jón Jónsson"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("modal-player-Siggi Bekkur"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("modal-player-Gunnar Gunnarsson"),
      ).not.toBeInTheDocument();
    });

    it("displays the man-of-the-match asset when a substituted-off home player is selected", async () => {
      const { mockShowItemNow } = setupMocks({ roster: mockRoster });

      const motmAsset = {
        type: "MOTM",
        key: "motm-key",
        name: "Siggi",
        number: 12,
      };
      mockedGetMOTMAsset.mockResolvedValue(
        motmAsset as unknown as Awaited<ReturnType<typeof getMOTMAsset>>,
      );

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Maður leiksins" }));
      fireEvent.click(screen.getByTestId("modal-player-Siggi Bekkur"));

      expect(mockedGetMOTMAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          player: expect.objectContaining({ name: "Siggi Bekkur" }) as unknown,
          teamName: "Víkingur R",
          listenPrefix: "vikinni",
        }),
      );
      await waitFor(() => {
        expect(mockShowItemNow).toHaveBeenCalledWith(motmAsset);
      });
    });
  });

  describe("modal interaction", () => {
    it("closes the selection modal without performing an action", () => {
      setupMocks({ roster: mockRoster });

      render(<HomeTeamQuickActions />);
      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));

      expect(screen.getByTestId("player-select-modal")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Close modal" }));

      expect(
        screen.queryByTestId("player-select-modal"),
      ).not.toBeInTheDocument();
      expect(mockedGetPlayerAssetObject).not.toHaveBeenCalled();
    });
  });
});
