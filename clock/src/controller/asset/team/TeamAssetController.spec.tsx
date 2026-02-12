import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import axios from "axios";

import TeamAssetController from "./TeamAssetController";
import { Player, AvailableMatches } from "../../../types";
import {
  useController,
  useMatch,
} from "../../../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../../../contexts/LocalStateContext";

vi.mock("../../../contexts/FirebaseStateContext", () => ({
  useMatch: vi.fn(),
  useController: vi.fn(),
}));

vi.mock("../../../contexts/LocalStateContext", () => ({
  useRemoteSettings: vi.fn(),
}));

vi.mock("axios");

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

vi.mock("./MatchSelector", () => ({
  default: () => <div data-testid="match-selector">MatchSelector</div>,
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
const mockedUseRemoteSettings = vi.mocked(useRemoteSettings);
const mockedAxiosGet = vi.fn<typeof axios.get>();
axios.get = mockedAxiosGet;
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

const mockAvailableMatches: AvailableMatches = {
  "1": {
    group: "Úrvalsdeild",
    sex: "M",
    players: {
      "103": mockPlayers,
      "107": mockAwayPlayers,
    },
  },
};

const multipleAvailableMatches: AvailableMatches = {
  "1": {
    group: "Úrvalsdeild",
    sex: "M",
    players: {
      "103": mockPlayers,
      "107": mockAwayPlayers,
    },
  },
  "2": {
    group: "Bikarkeppni",
    sex: "M",
    players: {
      "103": mockPlayers,
      "107": mockAwayPlayers,
    },
  },
};

const defaultMatch = {
  homeTeam: "Víkingur R",
  awayTeam: "KR",
  homeScore: 0,
  awayScore: 0,
  started: 0,
  timeElapsed: 0,
  halfStops: [45, 90],
  homeTeamId: 103,
  awayTeamId: 107,
  injuryTime: 0,
  matchType: "football" as const,
  home2min: [],
  away2min: [],
  timeout: 0,
  homeTimeouts: 0,
  awayTimeouts: 0,
  buzzer: false as const,
  countdown: false,
};

function setupMocks(overrides?: {
  match?: Partial<typeof defaultMatch>;
  availableMatches?: AvailableMatches;
  selectedMatch?: string | null;
}) {
  const mockClearMatchPlayers = vi.fn();
  const mockSetAvailableMatches = vi.fn();

  mockedUseMatch.mockReturnValue({
    match: { ...defaultMatch, ...overrides?.match },
  } as unknown as ReturnType<typeof useMatch>);

  mockedUseController.mockReturnValue({
    controller: {
      availableMatches: overrides?.availableMatches ?? {},
      selectedMatch: overrides?.selectedMatch ?? null,
    },
    clearMatchPlayers: mockClearMatchPlayers,
    setAvailableMatches: mockSetAvailableMatches,
  } as unknown as ReturnType<typeof useController>);

  mockedUseRemoteSettings.mockReturnValue({
    listenPrefix: "vikinni",
  } as unknown as ReturnType<typeof useRemoteSettings>);

  return { mockClearMatchPlayers, mockSetAvailableMatches };
}

describe("TeamAssetController", () => {
  let mockAddAssets: ReturnType<typeof vi.fn>;
  let mockPreviousView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAddAssets = vi.fn();
    mockPreviousView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial render", () => {
    it("shows team selection message when no teams selected", () => {
      setupMocks({ match: { homeTeam: "", awayTeam: "" } });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      expect(screen.getByText("Veldu lið fyrst")).toBeInTheDocument();
    });

    it("shows team selection message when homeTeam is empty", () => {
      setupMocks({ match: { homeTeam: "" } });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      expect(screen.getByText("Veldu lið fyrst")).toBeInTheDocument();
    });

    it("renders team components when teams are selected", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      expect(screen.getByTestId("team-homeTeam")).toBeInTheDocument();
      expect(screen.getByTestId("team-awayTeam")).toBeInTheDocument();
    });

    it('shows "Sækja lið" button when no players loaded', () => {
      setupMocks();

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Sækja lið" }),
      ).toBeInTheDocument();
    });

    it('shows "Hreinsa lið" and "Setja lið í biðröð" when players are loaded', () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Hreinsa lið" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Setja lið í biðröð" }),
      ).toBeInTheDocument();
    });

    it('hides "Sækja lið" button when players are loaded', () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      expect(
        screen.queryByRole("button", { name: "Sækja lið" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("autoFill / fetch available matches", () => {
    it("calls axios and sets available matches on success", async () => {
      const { mockSetAvailableMatches } = setupMocks();

      mockedAxiosGet.mockResolvedValueOnce({ data: mockAvailableMatches });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Sækja lið" }));

      expect(screen.getByTestId("ring-loader")).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByTestId("ring-loader")).not.toBeInTheDocument();
      });

      expect(mockedAxiosGet).toHaveBeenCalledWith(
        "https://clock-api.irdn.is/match-report",
        { params: { homeTeam: "103", awayTeam: "107" } },
      );

      expect(mockSetAvailableMatches).toHaveBeenCalledWith(
        mockAvailableMatches,
      );
    });

    it("shows error on API failure", async () => {
      setupMocks();

      mockedAxiosGet.mockRejectedValueOnce(new Error("Network error"));

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Sækja lið" }));

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });

    it("shows error when teams not in club-ids", () => {
      setupMocks({ match: { homeTeam: "", awayTeam: "" } });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      expect(screen.getByText("Veldu lið fyrst")).toBeInTheDocument();
    });
  });

  describe("clear match players", () => {
    it("calls clearMatchPlayers when confirmed", () => {
      const { mockClearMatchPlayers } = setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      vi.spyOn(window, "confirm").mockReturnValue(true);

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Hreinsa lið" }));

      expect(window.confirm).toHaveBeenCalledWith("Ertu alveg viss?");
      expect(mockClearMatchPlayers).toHaveBeenCalledTimes(1);
    });

    it("does not call clearMatchPlayers when cancelled", () => {
      const { mockClearMatchPlayers } = setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      vi.spyOn(window, "confirm").mockReturnValue(false);

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Hreinsa lið" }));

      expect(window.confirm).toHaveBeenCalledWith("Ertu alveg viss?");
      expect(mockClearMatchPlayers).not.toHaveBeenCalled();
    });

    it('shows "Hreinsa lið" when availableMatches has entries but no players', () => {
      setupMocks({
        availableMatches: { "1": { players: {} } },
        selectedMatch: null,
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Hreinsa lið" }),
      ).toBeInTheDocument();
    });
  });

  describe("add players to queue", () => {
    it("adds visible players to queue and calls previousView", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
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

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Setja lið í biðröð" }),
      );

      expect(mockAddAssets).toHaveBeenCalled();
      expect(mockPreviousView).toHaveBeenCalled();
    });

    it("shows error when getPlayerAssetObject returns null for some players", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      mockedGetPlayerAssetObject.mockReturnValue(
        null as unknown as ReturnType<typeof getPlayerAssetObject>,
      );

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Setja lið í biðröð" }),
      );

      expect(
        screen.getByText("Missing name/number for some players to show"),
      ).toBeInTheDocument();
      expect(mockAddAssets).not.toHaveBeenCalled();
      expect(mockPreviousView).not.toHaveBeenCalled();
    });
  });

  describe("action buttons", () => {
    it("renders action buttons when players are loaded", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

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
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      const select = screen.getByDisplayValue("Blink");
      expect(select).toBeInTheDocument();
    });

    it("allows changing the effect", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      const select = screen.getByDisplayValue("Blink");
      fireEvent.change(select, { target: { value: "shaker" } });

      expect(screen.getByDisplayValue("Shaker")).toBeInTheDocument();
    });
  });

  describe("substitution flow", () => {
    it("enters sub mode and shows cancel button", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));

      expect(
        screen.getByRole("button", { name: "Hætta við skiptingu" }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("sub-view")).toBeInTheDocument();
    });

    it("cancels sub mode when cancel button clicked", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(
        screen.getByRole("button", { name: "Hætta við skiptingu" }),
      );

      expect(
        screen.getByRole("button", { name: "Skipting" }),
      ).toBeInTheDocument();
    });

    it("enables player selection on Team components during sub mode", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));

      expect(screen.getByTestId("select-player-homeTeam")).toBeInTheDocument();
      expect(screen.getByTestId("select-player-awayTeam")).toBeInTheDocument();
    });

    it("selects first sub player (subIn) and shows SubView", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      expect(screen.getByTestId("sub-in")).toBeInTheDocument();
      expect(screen.getByTestId("sub-team")).toHaveTextContent("Víkingur R");
    });

    it("completes substitution flow when both players selected", async () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
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

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      await waitFor(() => {
        expect(mockAddAssets).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              type: "SUB",
              subIn: subInAsset,
              subOut: subOutAsset,
            }),
          ],
          { showNow: true },
        );
      });
    });

    it("does not call addAssets if getPlayerAssetObject returns null for subIn", async () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      mockedGetPlayerAssetObject.mockResolvedValue(null);

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      await waitFor(() => {
        expect(mockedGetPlayerAssetObject).toHaveBeenCalled();
      });

      expect(mockAddAssets).not.toHaveBeenCalled();
    });
  });

  describe("select player asset", () => {
    it("enters player asset mode and shows cancel button", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));

      expect(
        screen.getByRole("button", { name: "Hætta við birtingu" }),
      ).toBeInTheDocument();
    });

    it("cancels player asset mode", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));
      fireEvent.click(
        screen.getByRole("button", { name: "Hætta við birtingu" }),
      );

      expect(
        screen.getByRole("button", { name: "Birta leikmann" }),
      ).toBeInTheDocument();
    });

    it("selects a player and adds asset with showNow", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      const playerAsset = {
        type: "PLAYER",
        key: "player-key",
        name: "Jón",
        number: 10,
      };
      mockedGetPlayerAssetObject.mockReturnValue(
        playerAsset as unknown as ReturnType<typeof getPlayerAssetObject>,
      );

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      expect(mockAddAssets).toHaveBeenCalledWith([playerAsset], {
        showNow: true,
      });
    });

    it("uses actual team name (not homeTeam/awayTeam key) for player asset", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      mockedGetPlayerAssetObject.mockReturnValue(
        {} as unknown as ReturnType<typeof getPlayerAssetObject>,
      );

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

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
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      mockedGetPlayerAssetObject.mockReturnValue(
        {} as unknown as ReturnType<typeof getPlayerAssetObject>,
      );

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

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
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Birta markaskorara" }),
      );

      expect(
        screen.getByRole("button", { name: "Hætta við birtingu" }),
      ).toBeInTheDocument();
    });

    it("selects goal scorer with overlay effect", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      const playerAsset = {
        type: "PLAYER",
        key: "player-key",
        name: "Jón",
        number: 10,
      };
      mockedGetPlayerAssetObject.mockReturnValue(
        playerAsset as unknown as ReturnType<typeof getPlayerAssetObject>,
      );

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Birta markaskorara" }),
      );
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      expect(mockedGetPlayerAssetObject).toHaveBeenCalledWith(
        expect.objectContaining({
          overlay: { text: "", blink: true, effect: "blink" },
        }),
      );
      expect(mockAddAssets).toHaveBeenCalledWith([playerAsset], {
        showNow: true,
      });
    });

    it("uses selected effect for goal scorer overlay", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      mockedGetPlayerAssetObject.mockReturnValue(
        {} as unknown as ReturnType<typeof getPlayerAssetObject>,
      );

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

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
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Birta mann leiksins" }),
      );

      expect(
        screen.getByRole("button", { name: "Hætta við birtingu" }),
      ).toBeInTheDocument();
    });

    it("selects MOTM and calls getMOTMAsset", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      const motmAsset = {
        type: "MOTM",
        key: "motm-key",
        name: "Jón",
        number: 10,
      };
      mockedGetMOTMAsset.mockReturnValue(
        motmAsset as unknown as ReturnType<typeof getMOTMAsset>,
      );

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

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
      expect(mockAddAssets).toHaveBeenCalledWith([motmAsset], {
        showNow: true,
      });
    });
  });

  describe("MatchSelector visibility", () => {
    it("shows MatchSelector when multiple available matches exist", () => {
      setupMocks({
        availableMatches: multipleAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      expect(screen.getByTestId("match-selector")).toBeInTheDocument();
    });

    it("hides MatchSelector when only one available match exists", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      expect(screen.queryByTestId("match-selector")).not.toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows spinner during data loading", () => {
      setupMocks();

      const neverResolves = new Promise<never>(
        Function.prototype as () => void,
      );
      mockedAxiosGet.mockReturnValue(neverResolves);

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Sækja lið" }));

      expect(screen.getByTestId("ring-loader")).toBeInTheDocument();
    });

    it("hides controls while loading", () => {
      setupMocks();

      const neverResolves = new Promise<never>(
        Function.prototype as () => void,
      );
      mockedAxiosGet.mockReturnValue(neverResolves);

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Sækja lið" }));

      expect(
        screen.queryByRole("button", { name: "Sækja lið" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("renderTeam selectPlayer behavior", () => {
    it("does not pass selectPlayer to Team when no action is selected", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      expect(
        screen.queryByTestId("select-player-homeTeam"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("select-player-awayTeam"),
      ).not.toBeInTheDocument();
    });

    it("passes selectPlayer to both teams in player asset mode", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));

      expect(screen.getByTestId("select-player-homeTeam")).toBeInTheDocument();
      expect(screen.getByTestId("select-player-awayTeam")).toBeInTheDocument();
    });

    it("passes selectPlayer to both teams in goal scorer mode", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Birta markaskorara" }),
      );

      expect(screen.getByTestId("select-player-homeTeam")).toBeInTheDocument();
      expect(screen.getByTestId("select-player-awayTeam")).toBeInTheDocument();
    });

    it("passes selectPlayer to both teams in MOTM mode", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Birta mann leiksins" }),
      );

      expect(screen.getByTestId("select-player-homeTeam")).toBeInTheDocument();
      expect(screen.getByTestId("select-player-awayTeam")).toBeInTheDocument();
    });
  });

  describe("cancel display mode", () => {
    it("cancels goal scorer mode from cancel button", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

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
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

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
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));

      expect(screen.queryByTestId("sub-team")).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      expect(screen.getByTestId("sub-team")).toHaveTextContent("Víkingur R");
    });

    it("shows correct team name in SubView for away team sub", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Skipting" }));
      fireEvent.click(screen.getByTestId("select-player-awayTeam"));

      expect(screen.getByTestId("sub-team")).toHaveTextContent("KR");
    });
  });

  describe("getTeamPlayers with no selected match", () => {
    it("renders with empty players when selectedMatch is null", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: null,
      });

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Sækja lið" }),
      ).toBeInTheDocument();
    });
  });

  describe("clearState after actions", () => {
    it("returns to default action buttons after selecting a player asset", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      mockedGetPlayerAssetObject.mockReturnValue(
        {} as unknown as ReturnType<typeof getPlayerAssetObject>,
      );

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Birta leikmann" }));
      expect(
        screen.getByRole("button", { name: "Hætta við birtingu" }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      expect(
        screen.getByRole("button", { name: "Skipting" }),
      ).toBeInTheDocument();
    });

    it("returns to default action buttons after selecting a goal scorer", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      mockedGetPlayerAssetObject.mockReturnValue(
        {} as unknown as ReturnType<typeof getPlayerAssetObject>,
      );

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Birta markaskorara" }),
      );
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      expect(
        screen.getByRole("button", { name: "Skipting" }),
      ).toBeInTheDocument();
    });

    it("returns to default action buttons after selecting MOTM", () => {
      setupMocks({
        availableMatches: mockAvailableMatches,
        selectedMatch: "1",
      });

      mockedGetMOTMAsset.mockReturnValue(
        {} as unknown as ReturnType<typeof getMOTMAsset>,
      );

      render(
        <TeamAssetController
          addAssets={mockAddAssets}
          previousView={mockPreviousView}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Birta mann leiksins" }),
      );
      fireEvent.click(screen.getByTestId("select-player-homeTeam"));

      expect(
        screen.getByRole("button", { name: "Skipting" }),
      ).toBeInTheDocument();
    });
  });
});
