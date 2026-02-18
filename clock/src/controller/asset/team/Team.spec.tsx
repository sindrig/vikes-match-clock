import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import axios from "axios";
import Team from "./Team";
import { Player } from "../../../types";

// Mock axios
vi.mock("axios");

// Mock Firebase context
vi.mock("../../../contexts/FirebaseStateContext", () => ({
  useController: vi.fn(),
  useMatch: vi.fn(),
}));

// Mock rsuite components
vi.mock("rsuite", () => ({
  Button: ({
    children,
    onClick,
    appearance,
  }: React.ComponentProps<"button"> & { appearance?: string }) => (
    <button
      type="button"
      onClick={onClick}
      className={`rs-btn ${appearance === "default" ? "rs-btn-default" : ""}`}
    >
      {children}
    </button>
  ),
  IconButton: ({
    icon,
    onClick,
    color,
  }: {
    icon: React.ReactNode;
    onClick?: () => void;
    color?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`rs-btn rs-btn-${color || "default"}`}
    >
      {icon}
    </button>
  ),
}));

// Mock rsuite icons
vi.mock("@rsuite/icons/Close", () => ({
  default: () => <span data-testid="close-icon">X</span>,
}));

vi.mock("@rsuite/icons/Reload", () => ({
  default: () => <span data-testid="reload-icon">R</span>,
}));

// Mock TeamPlayer component
vi.mock("./TeamPlayer", () => ({
  default: ({
    player,
    onChange,
  }: {
    player: Player;
    onChange: (p: Partial<Player>) => void;
  }) => (
    <div data-testid="team-player">
      <span>Player: {player.name || "empty"}</span>
      <button
        type="button"
        onClick={() => onChange({ name: "Updated Player" })}
      >
        Update
      </button>
    </div>
  ),
}));

import {
  useController,
  useMatch,
} from "../../../contexts/FirebaseStateContext";

const mockedUseController = vi.mocked(useController);
const mockedUseMatch = vi.mocked(useMatch);
const mockedAxios = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
};

describe("Team", () => {
  const mockEditPlayer = vi.fn();
  const mockDeletePlayer = vi.fn();
  const mockAddPlayer = vi.fn();

  const mockPlayers: Player[] = [
    { name: "Player One", number: 1, id: 101, show: true },
    { name: "Player Two", number: 2, id: 102, show: true },
    { name: "Player Three", number: 3, show: false },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Default controller mock
    mockedUseController.mockReturnValue({
      controller: {
        availableMatches: {
          match1: {
            players: {
              "10": mockPlayers,
              "20": [
                { name: "Away One", number: 11, id: 201 },
                { name: "Away Two", number: 12, id: 202 },
              ],
            },
            group: "A",
            sex: "male",
          },
        },
        selectedMatch: "match1",
      },
      editPlayer: mockEditPlayer,
      deletePlayer: mockDeletePlayer,
      addPlayer: mockAddPlayer,
    } as unknown as ReturnType<typeof useController>);

    // Default match mock
    mockedUseMatch.mockReturnValue({
      match: {
        homeTeamId: 10,
        awayTeamId: 20,
        homeTeam: "Home FC",
        awayTeam: "Away United",
      },
    } as unknown as ReturnType<typeof useMatch>);
  });

  describe("Team display", () => {
    it("should render home team name and players", () => {
      render(<Team teamName="homeTeam" />);

      expect(screen.getByText("Home FC")).toBeInTheDocument();
      expect(screen.getByText("Player: Player One")).toBeInTheDocument();
      expect(screen.getByText("Player: Player Two")).toBeInTheDocument();
      expect(screen.getByText("Player: Player Three")).toBeInTheDocument();
    });

    it("should render away team name and players", () => {
      render(<Team teamName="awayTeam" />);

      expect(screen.getByText("Away United")).toBeInTheDocument();
      expect(screen.getByText("Player: Away One")).toBeInTheDocument();
      expect(screen.getByText("Player: Away Two")).toBeInTheDocument();
    });

    it("should render nothing when team name is not set", () => {
      mockedUseMatch.mockReturnValue({
        match: {
          homeTeamId: 10,
          awayTeamId: 20,
          homeTeam: "",
          awayTeam: "Away United",
        },
      } as unknown as ReturnType<typeof useMatch>);

      const { container } = render(<Team teamName="homeTeam" />);
      expect(screen.queryByText("Player: Player One")).not.toBeInTheDocument();
      expect(
        container.querySelector(".player-whole-line"),
      ).not.toBeInTheDocument();
    });

    it("should not render add player button when selectedMatch is null", () => {
      mockedUseController.mockReturnValue({
        controller: {
          availableMatches: {},
          selectedMatch: null,
        },
        editPlayer: mockEditPlayer,
        deletePlayer: mockDeletePlayer,
        addPlayer: mockAddPlayer,
      } as unknown as ReturnType<typeof useController>);

      render(<Team teamName="homeTeam" />);
      expect(screen.queryByText("Ný lína...")).not.toBeInTheDocument();
    });
  });

  describe("Add player functionality", () => {
    it("should call addPlayer with correct teamId when add button clicked", () => {
      render(<Team teamName="homeTeam" />);

      const addButton = screen.getByText("Ný lína...");
      fireEvent.click(addButton);

      expect(mockAddPlayer).toHaveBeenCalledWith("10");
    });

    it("should call addPlayer with away team ID for away team", () => {
      render(<Team teamName="awayTeam" />);

      const addButton = screen.getByText("Ný lína...");
      fireEvent.click(addButton);

      expect(mockAddPlayer).toHaveBeenCalledWith("20");
    });
  });

  describe("Delete player functionality", () => {
    it("should call deletePlayer when close icon clicked", () => {
      const { container } = render(<Team teamName="homeTeam" />);

      const playerLines = container.querySelectorAll(".player-whole-line");
      expect(playerLines.length).toBe(3);

      const firstPlayerLine = playerLines[0];
      const buttons = firstPlayerLine.querySelectorAll("button");
      const deleteButton = Array.from(buttons).find((btn) =>
        btn.className.includes("red"),
      );

      expect(deleteButton).toBeDefined();
      fireEvent.click(deleteButton!);

      expect(mockDeletePlayer).toHaveBeenCalledWith("10", 0);
    });

    it("should not render delete button when selectPlayer is provided", () => {
      const mockSelectPlayer = vi.fn();
      const { container } = render(
        <Team teamName="homeTeam" selectPlayer={mockSelectPlayer} />,
      );

      const playerLines = container.querySelectorAll(".player-whole-line");
      const firstPlayerLine = playerLines[0];
      const buttons = firstPlayerLine.querySelectorAll("button");
      const deleteButton = Array.from(buttons).find((btn) =>
        btn.className.includes("red"),
      );

      expect(deleteButton).toBeUndefined();
    });
  });

  describe("Edit player functionality", () => {
    it("should call editPlayer when TeamPlayer onChange is triggered", () => {
      render(<Team teamName="homeTeam" />);

      const updateButtons = screen.getAllByText("Update");
      fireEvent.click(updateButtons[0]);

      expect(mockEditPlayer).toHaveBeenCalledWith("10", 0, {
        name: "Updated Player",
      });
    });
  });

  describe("Fetch player ID functionality", () => {
    beforeEach(() => {
      mockedAxios.get.mockResolvedValue({
        data: {
          id: 999,
          name: "Updated Name",
          number: 99,
          role: "Forward",
        },
      });
    });

    it("should render reload icon for players without ID", () => {
      mockedUseController.mockReturnValue({
        controller: {
          availableMatches: {
            match1: {
              players: {
                "10": [{ name: "No ID Player", number: 5, show: true }],
              },
              group: "A",
              sex: "male",
            },
          },
          selectedMatch: "match1",
        },
        editPlayer: mockEditPlayer,
        deletePlayer: mockDeletePlayer,
        addPlayer: mockAddPlayer,
      } as unknown as ReturnType<typeof useController>);

      const { container } = render(<Team teamName="homeTeam" />);

      const playerLines = container.querySelectorAll(".player-whole-line");
      const firstPlayerLine = playerLines[0];
      const buttons = firstPlayerLine.querySelectorAll("button");
      const reloadButton = Array.from(buttons).find((btn) =>
        btn.className.includes("blue"),
      );

      expect(reloadButton).toBeDefined();
    });

    it("should not render reload icon for players with ID", () => {
      const { container } = render(<Team teamName="homeTeam" />);

      const playerLines = container.querySelectorAll(".player-whole-line");
      const firstPlayerLine = playerLines[0];
      const buttons = firstPlayerLine.querySelectorAll("button");
      const reloadButton = Array.from(buttons).find((btn) =>
        btn.className.includes("blue"),
      );

      expect(reloadButton).toBeUndefined();
    });

    it("should fetch player ID and update player on success", async () => {
      mockedUseController.mockReturnValue({
        controller: {
          availableMatches: {
            match1: {
              players: {
                "10": [{ name: "Fetch Me", number: 7, show: true }],
              },
              group: "A",
              sex: "male",
            },
          },
          selectedMatch: "match1",
        },
        editPlayer: mockEditPlayer,
        deletePlayer: mockDeletePlayer,
        addPlayer: mockAddPlayer,
      } as unknown as ReturnType<typeof useController>);

      const { container } = render(<Team teamName="homeTeam" />);

      const playerLines = container.querySelectorAll(".player-whole-line");
      const firstPlayerLine = playerLines[0];
      const buttons = firstPlayerLine.querySelectorAll("button");
      const reloadButton = Array.from(buttons).find((btn) =>
        btn.className.includes("blue"),
      );

      fireEvent.click(reloadButton!);

      await vi.waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining("match-report/v2?action=search-for-player"),
          {
            params: {
              playerName: "Fetch Me",
              teamId: 10,
              group: "A",
              sex: "male",
            },
          },
        );
      });

      await vi.waitFor(() => {
        expect(mockEditPlayer).toHaveBeenCalledWith("10", 0, {
          id: 999,
          name: "Updated Name",
          number: 99,
          role: "Forward",
          show: true,
        });
      });
    });

    it("should show error when player has no name", () => {
      mockedUseController.mockReturnValue({
        controller: {
          availableMatches: {
            match1: {
              players: {
                "10": [{ name: "", number: 7, show: true }],
              },
              group: "A",
              sex: "male",
            },
          },
          selectedMatch: "match1",
        },
        editPlayer: mockEditPlayer,
        deletePlayer: mockDeletePlayer,
        addPlayer: mockAddPlayer,
      } as unknown as ReturnType<typeof useController>);

      const { container } = render(<Team teamName="homeTeam" />);

      const playerLines = container.querySelectorAll(".player-whole-line");
      const firstPlayerLine = playerLines[0];
      const buttons = firstPlayerLine.querySelectorAll("button");
      const reloadButton = Array.from(buttons).find((btn) =>
        btn.className.includes("blue"),
      );

      fireEvent.click(reloadButton!);

      expect(
        screen.getByText("Player not found or has no name"),
      ).toBeInTheDocument();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it("should show error when response has no ID", async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          name: "No ID",
        },
      });

      mockedUseController.mockReturnValue({
        controller: {
          availableMatches: {
            match1: {
              players: {
                "10": [{ name: "No ID Player", number: 8, show: true }],
              },
              group: "A",
              sex: "male",
            },
          },
          selectedMatch: "match1",
        },
        editPlayer: mockEditPlayer,
        deletePlayer: mockDeletePlayer,
        addPlayer: mockAddPlayer,
      } as unknown as ReturnType<typeof useController>);

      const { container } = render(<Team teamName="homeTeam" />);

      const playerLines = container.querySelectorAll(".player-whole-line");
      const firstPlayerLine = playerLines[0];
      const buttons = firstPlayerLine.querySelectorAll("button");
      const reloadButton = Array.from(buttons).find((btn) =>
        btn.className.includes("blue"),
      );

      fireEvent.click(reloadButton!);

      await vi.waitFor(() => {
        expect(
          screen.getByText("No ID found for player No ID Player"),
        ).toBeInTheDocument();
      });
    });

    it("should show error on axios failure", async () => {
      mockedAxios.get.mockRejectedValue(new Error("Network error"));

      mockedUseController.mockReturnValue({
        controller: {
          availableMatches: {
            match1: {
              players: {
                "10": [{ name: "Error Player", number: 9, show: true }],
              },
              group: "A",
              sex: "male",
            },
          },
          selectedMatch: "match1",
        },
        editPlayer: mockEditPlayer,
        deletePlayer: mockDeletePlayer,
        addPlayer: mockAddPlayer,
      } as unknown as ReturnType<typeof useController>);

      const { container } = render(<Team teamName="homeTeam" />);

      const playerLines = container.querySelectorAll(".player-whole-line");
      const firstPlayerLine = playerLines[0];
      const buttons = firstPlayerLine.querySelectorAll("button");
      const reloadButton = Array.from(buttons).find((btn) =>
        btn.className.includes("blue"),
      );

      fireEvent.click(reloadButton!);

      await vi.waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });

    it("should set loading state during fetch", async () => {
      let resolvePromise: ((value: unknown) => void) | undefined;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockedAxios.get.mockReturnValue(promise as never);

      mockedUseController.mockReturnValue({
        controller: {
          availableMatches: {
            match1: {
              players: {
                "10": [{ name: "Loading Player", number: 10, show: true }],
              },
              group: "A",
              sex: "male",
            },
          },
          selectedMatch: "match1",
        },
        editPlayer: mockEditPlayer,
        deletePlayer: mockDeletePlayer,
        addPlayer: mockAddPlayer,
      } as unknown as ReturnType<typeof useController>);

      const { container } = render(<Team teamName="homeTeam" />);

      const playerLines = container.querySelectorAll(".player-whole-line");
      const firstPlayerLine = playerLines[0];
      const buttons = firstPlayerLine.querySelectorAll("button");
      const reloadButton = Array.from(buttons).find((btn) =>
        btn.className.includes("blue"),
      );

      fireEvent.click(reloadButton!);

      await vi.waitFor(() => {
        const teamContainer = container.querySelector(".team-asset-container");
        expect(teamContainer?.getAttribute("style")).toContain(
          "background-color: grey",
        );
      });

      if (resolvePromise) {
        resolvePromise({ data: { id: 999, name: "Loaded" } });
      }
    });
  });

  describe("Select player mode", () => {
    const mockSelectPlayer = vi.fn();

    it("should render form when selectPlayer is provided", () => {
      render(<Team teamName="homeTeam" selectPlayer={mockSelectPlayer} />);

      const input = screen.getByPlaceholderText("# leikmanns og ENTER");
      expect(input).toBeInTheDocument();
    });

    it("should not render form when selectPlayer is null", () => {
      render(<Team teamName="homeTeam" selectPlayer={null} />);

      const input = screen.queryByPlaceholderText("# leikmanns og ENTER");
      expect(input).not.toBeInTheDocument();
    });

    it("should render buttons instead of TeamPlayer when selectPlayer provided", () => {
      render(<Team teamName="homeTeam" selectPlayer={mockSelectPlayer} />);

      expect(screen.queryByTestId("team-player")).not.toBeInTheDocument();
      expect(screen.getByText("#1 - Player One")).toBeInTheDocument();
    });

    it("should call selectPlayer when player button clicked", () => {
      render(<Team teamName="homeTeam" selectPlayer={mockSelectPlayer} />);

      const playerButton = screen.getByText("#1 - Player One");
      fireEvent.click(playerButton);

      expect(mockSelectPlayer).toHaveBeenCalledWith(mockPlayers[0], "homeTeam");
    });

    it("should find player by number and call selectPlayer on form submit", () => {
      render(<Team teamName="homeTeam" selectPlayer={mockSelectPlayer} />);

      const input = screen.getByPlaceholderText("# leikmanns og ENTER");
      fireEvent.change(input, { target: { value: "2" } });

      const form = input.closest("form");
      fireEvent.submit(form!);

      expect(mockSelectPlayer).toHaveBeenCalledWith(mockPlayers[1], "homeTeam");
    });

    it("should show error when player number not found on submit", () => {
      render(<Team teamName="homeTeam" selectPlayer={mockSelectPlayer} />);

      const input = screen.getByPlaceholderText("# leikmanns og ENTER");
      fireEvent.change(input, { target: { value: "99" } });

      const form = input.closest("form");
      fireEvent.submit(form!);

      expect(screen.getByText("No player #99 found")).toBeInTheDocument();
      expect(mockSelectPlayer).not.toHaveBeenCalled();
    });

    it("should clear input and error after successful submit", () => {
      render(<Team teamName="homeTeam" selectPlayer={mockSelectPlayer} />);

      const input = screen.getByPlaceholderText("# leikmanns og ENTER");
      fireEvent.change(input, { target: { value: "1" } });

      const form = input.closest("form");
      fireEvent.submit(form!);

      expect(input).toHaveValue("");
      expect(screen.queryByText(/No player/)).not.toBeInTheDocument();
    });

    it("should display role initial when player has role but no number", () => {
      mockedUseController.mockReturnValue({
        controller: {
          availableMatches: {
            match1: {
              players: {
                "10": [{ name: "Coach", role: "Manager", show: true }],
              },
              group: "A",
              sex: "male",
            },
          },
          selectedMatch: "match1",
        },
        editPlayer: mockEditPlayer,
        deletePlayer: mockDeletePlayer,
        addPlayer: mockAddPlayer,
      } as unknown as ReturnType<typeof useController>);

      render(<Team teamName="homeTeam" selectPlayer={mockSelectPlayer} />);

      expect(screen.getByText("#M - Coach")).toBeInTheDocument();
    });

    it("should display empty when player has neither number nor role", () => {
      mockedUseController.mockReturnValue({
        controller: {
          availableMatches: {
            match1: {
              players: {
                "10": [{ name: "Unknown", show: true }],
              },
              group: "A",
              sex: "male",
            },
          },
          selectedMatch: "match1",
        },
        editPlayer: mockEditPlayer,
        deletePlayer: mockDeletePlayer,
        addPlayer: mockAddPlayer,
      } as unknown as ReturnType<typeof useController>);

      render(<Team teamName="homeTeam" selectPlayer={mockSelectPlayer} />);

      expect(screen.getByText("# - Unknown")).toBeInTheDocument();
    });
  });

  describe("Edge cases", () => {
    it("should handle empty team players array", () => {
      mockedUseController.mockReturnValue({
        controller: {
          availableMatches: {
            match1: {
              players: {
                "10": [],
              },
              group: "A",
              sex: "male",
            },
          },
          selectedMatch: "match1",
        },
        editPlayer: mockEditPlayer,
        deletePlayer: mockDeletePlayer,
        addPlayer: mockAddPlayer,
      } as unknown as ReturnType<typeof useController>);

      render(<Team teamName="homeTeam" />);

      expect(screen.getByText("Home FC")).toBeInTheDocument();
      expect(screen.queryByTestId("team-player")).not.toBeInTheDocument();
    });

    it("should handle missing players object for team", () => {
      mockedUseController.mockReturnValue({
        controller: {
          availableMatches: {
            match1: {
              players: {},
              group: "A",
              sex: "male",
            },
          },
          selectedMatch: "match1",
        },
        editPlayer: mockEditPlayer,
        deletePlayer: mockDeletePlayer,
        addPlayer: mockAddPlayer,
      } as unknown as ReturnType<typeof useController>);

      render(<Team teamName="homeTeam" />);

      expect(screen.getByText("Home FC")).toBeInTheDocument();
      expect(screen.queryByTestId("team-player")).not.toBeInTheDocument();
    });

    it("should handle undefined selectedMatchObj", () => {
      mockedUseController.mockReturnValue({
        controller: {
          availableMatches: {},
          selectedMatch: "nonexistent",
        },
        editPlayer: mockEditPlayer,
        deletePlayer: mockDeletePlayer,
        addPlayer: mockAddPlayer,
      } as unknown as ReturnType<typeof useController>);

      render(<Team teamName="homeTeam" />);

      expect(screen.getByText("Home FC")).toBeInTheDocument();
      expect(screen.queryByTestId("team-player")).not.toBeInTheDocument();
    });
  });
});
