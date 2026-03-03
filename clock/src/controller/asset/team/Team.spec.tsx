import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Team from "./Team";
import { Player } from "../../../types";

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
    // Default controller mock with roster-based data model
    mockedUseController.mockReturnValue({
      controller: {
        roster: {
          home: mockPlayers,
          away: [
            { name: "Away One", number: 11, id: 201, show: true },
            { name: "Away Two", number: 12, id: 202, show: true },
          ],
        },
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

    it("should render add player button even when roster is empty", () => {
      mockedUseController.mockReturnValue({
        controller: {
          roster: {
            home: [],
            away: [],
          },
        },
        editPlayer: mockEditPlayer,
        deletePlayer: mockDeletePlayer,
        addPlayer: mockAddPlayer,
      } as unknown as ReturnType<typeof useController>);

      render(<Team teamName="homeTeam" />);
      expect(screen.getByText("Ný lína...")).toBeInTheDocument();
    });
  });

  describe("Add player functionality", () => {
    it("should call addPlayer with correct teamId when add button clicked", () => {
      render(<Team teamName="homeTeam" />);

      const addButton = screen.getByText("Ný lína...");
      fireEvent.click(addButton);

      expect(mockAddPlayer).toHaveBeenCalledWith("home");
    });

    it("should call addPlayer with away team ID for away team", () => {
      render(<Team teamName="awayTeam" />);

      const addButton = screen.getByText("Ný lína...");
      fireEvent.click(addButton);

      expect(mockAddPlayer).toHaveBeenCalledWith("away");
    });
  });

  describe("Delete player functionality", () => {
    it("should call deletePlayer when close icon clicked", () => {
      const { container } = render(<Team teamName="homeTeam" />);

      const playerLines = container.querySelectorAll(".player-whole-line");
      expect(playerLines.length).toBe(3);

      const firstPlayerLine = playerLines[0] as HTMLElement;
      const buttons = firstPlayerLine.querySelectorAll("button");
      const deleteButton = Array.from(buttons).find((btn) =>
        btn.className.includes("red"),
      );

      expect(deleteButton).toBeDefined();
      fireEvent.click(deleteButton!);

      expect(mockDeletePlayer).toHaveBeenCalledWith("home", 0);
    });

    it("should not render delete button when selectPlayer is provided", () => {
      const mockSelectPlayer = vi.fn();
      const { container } = render(
        <Team teamName="homeTeam" selectPlayer={mockSelectPlayer} />,
      );

      const playerLines = container.querySelectorAll(".player-whole-line");
      const firstPlayerLine = playerLines[0] as HTMLElement;
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
      fireEvent.click(updateButtons[0] as HTMLElement);

      expect(mockEditPlayer).toHaveBeenCalledWith("home", 0, {
        name: "Updated Player",
      });
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
          roster: {
            home: [{ name: "Coach", role: "Manager", show: true }],
            away: [],
          },
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
          roster: {
            home: [{ name: "Unknown", show: true }],
            away: [],
          },
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
          roster: {
            home: [],
            away: [],
          },
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
          roster: {
            home: [],
            away: [],
          },
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
          roster: {
            home: [],
            away: [],
          },
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
