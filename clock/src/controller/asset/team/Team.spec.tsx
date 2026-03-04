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
}));

import {
  useController,
  useMatch,
} from "../../../contexts/FirebaseStateContext";

const mockedUseController = vi.mocked(useController);
const mockedUseMatch = vi.mocked(useMatch);

describe("Team", () => {
  const mockEditPlayer = vi.fn();

  const mockPlayers: Player[] = [
    { name: "Player One", number: 1, id: 101, show: true },
    { name: "Player Two", number: 2, id: 102, show: true },
    { name: "Player Three", number: 3, show: false },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

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
    } as unknown as ReturnType<typeof useController>);

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
      expect(screen.getByText("Player One")).toBeInTheDocument();
      expect(screen.getByText("Player Two")).toBeInTheDocument();
      expect(screen.getByText("Player Three")).toBeInTheDocument();
    });

    it("should render away team name and players", () => {
      render(<Team teamName="awayTeam" />);

      expect(screen.getByText("Away United")).toBeInTheDocument();
      expect(screen.getByText("Away One")).toBeInTheDocument();
      expect(screen.getByText("Away Two")).toBeInTheDocument();
    });

    it("should render player numbers", () => {
      render(<Team teamName="homeTeam" />);

      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
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
      expect(screen.queryByText("Player One")).not.toBeInTheDocument();
      expect(
        container.querySelector(".player-whole-line"),
      ).not.toBeInTheDocument();
    });

    it("should not render add player button", () => {
      render(<Team teamName="homeTeam" />);
      expect(screen.queryByText("+ Ný lína")).not.toBeInTheDocument();
    });

    it("should not render delete buttons", () => {
      const { container } = render(<Team teamName="homeTeam" />);
      const redButtons = container.querySelectorAll(".rs-btn-red");
      expect(redButtons.length).toBe(0);
    });
  });

  describe("Show checkbox", () => {
    it("should render checkboxes for each player", () => {
      const { container } = render(<Team teamName="homeTeam" />);
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBe(3);
    });

    it("should reflect player show state in checkboxes", () => {
      const { container } = render(<Team teamName="homeTeam" />);
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');

      expect(checkboxes[0]).toBeChecked(); // Player One show: true
      expect(checkboxes[1]).toBeChecked(); // Player Two show: true
      expect(checkboxes[2]).not.toBeChecked(); // Player Three show: false
    });

    it("should call editPlayer to toggle show when checkbox clicked", () => {
      const { container } = render(<Team teamName="homeTeam" />);
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');

      fireEvent.click(checkboxes[0] as HTMLElement);
      expect(mockEditPlayer).toHaveBeenCalledWith("home", 0, { show: false });

      fireEvent.click(checkboxes[2] as HTMLElement);
      expect(mockEditPlayer).toHaveBeenCalledWith("home", 2, { show: true });
    });

    it("should call editPlayer with away side for away team", () => {
      const { container } = render(<Team teamName="awayTeam" />);
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');

      fireEvent.click(checkboxes[0] as HTMLElement);
      expect(mockEditPlayer).toHaveBeenCalledWith("away", 0, { show: false });
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

    it("should render buttons instead of checkboxes when selectPlayer provided", () => {
      const { container } = render(
        <Team teamName="homeTeam" selectPlayer={mockSelectPlayer} />,
      );

      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBe(0);
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
      } as unknown as ReturnType<typeof useController>);

      render(<Team teamName="homeTeam" />);

      expect(screen.getByText("Home FC")).toBeInTheDocument();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
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
      } as unknown as ReturnType<typeof useController>);

      render(<Team teamName="homeTeam" />);

      expect(screen.getByText("Home FC")).toBeInTheDocument();
    });

    it("should handle player with no name", () => {
      mockedUseController.mockReturnValue({
        controller: {
          roster: {
            home: [{ number: 99, show: true } as Player],
            away: [],
          },
        },
        editPlayer: mockEditPlayer,
      } as unknown as ReturnType<typeof useController>);

      render(<Team teamName="homeTeam" />);

      expect(screen.getByText("99")).toBeInTheDocument();
    });
  });
});
