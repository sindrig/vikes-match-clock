import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TodaysMatches from "./TodaysMatches";

vi.mock("../../../api/client", () => ({
  getMatches: vi.fn(),
  getLineups: vi.fn(),
}));

vi.mock("../../../lib/matchUtils", () => ({
  transformLineups: vi.fn(),
  getTeamId: vi.fn(),
}));

// Mock Firebase context hooks
vi.mock("../../../contexts/FirebaseStateContext", () => ({
  useController: vi.fn(),
  useMatch: vi.fn(),
  useListeners: vi.fn(),
}));

vi.mock("../../../contexts/LocalStateContext", () => ({
  useRemoteSettings: vi.fn(),
}));

// Mock RingLoader
vi.mock("react-spinners", () => ({
  RingLoader: ({ loading }: { loading: boolean }) =>
    loading ? <div data-testid="ring-loader">Loading...</div> : null,
}));

import {
  useController,
  useMatch,
  useListeners,
} from "../../../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../../../contexts/LocalStateContext";
import { getMatches, getLineups } from "../../../api/client";
import { transformLineups, getTeamId } from "../../../lib/matchUtils";

const mockedUseController = vi.mocked(useController);
const mockedUseMatch = vi.mocked(useMatch);
const mockedUseListeners = vi.mocked(useListeners);
const mockedUseRemoteSettings = vi.mocked(useRemoteSettings);
const mockedGetMatches = vi.mocked(getMatches);
const mockedGetLineups = vi.mocked(getLineups);
const mockedTransformLineups = vi.mocked(transformLineups);
const mockedGetTeamId = vi.mocked(getTeamId);

describe("TodaysMatches", () => {
  const mockSetRoster = vi.fn();
  const mockUpdateMatch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockedUseController.mockReturnValue({
      setRoster: mockSetRoster,
    } as unknown as ReturnType<typeof useController>);

    mockedUseMatch.mockReturnValue({
      updateMatch: mockUpdateMatch,
    } as unknown as ReturnType<typeof useMatch>);

    mockedUseListeners.mockReturnValue({
      screens: [
        {
          screen: {
            style: { height: 1080, width: 1920 },
            name: "Test Screen",
            key: "test-screen",
          },
          label: "Test Screen",
          key: "vikinni",
          pitchIds: ["pitch-123"],
        },
      ],
    } as unknown as ReturnType<typeof useListeners>);

    mockedUseRemoteSettings.mockReturnValue({
      listenPrefix: "vikinni",
    } as unknown as ReturnType<typeof useRemoteSettings>);

    mockedGetTeamId.mockReturnValue(2492);
  });

  describe("Initial render", () => {
    it("renders initial state with two action buttons", () => {
      render(<TodaysMatches />);

      expect(
        screen.getByRole("button", { name: /Sækja leiki í dag/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Slá inn ID leikskýrslu/i }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("ring-loader")).not.toBeInTheDocument();
    });

    it("does not show error message initially", () => {
      render(<TodaysMatches />);

      const errorSpan = screen.getByText("", { selector: "span.error" });
      expect(errorSpan).toBeInTheDocument();
      expect(errorSpan.textContent).toBe("");
    });
  });

  describe("fetchTodaysMatches", () => {
    it("fetches and displays matches on button click", async () => {
      const apiMatch1 = {
        id: 100,
        dateTimeUTC: "2024-01-15T19:00:00Z",
        competition: { id: 1, name: "Úrvalsdeild" },
        homeTeam: { id: 10, name: "Víkingur" },
        awayTeam: { id: 20, name: "KR" },
        liveStatus: "not_started",
      };
      const apiMatch2 = {
        id: 200,
        dateTimeUTC: "2024-01-20T15:00:00Z",
        competition: { id: 2, name: "Bikarinn" },
        homeTeam: { id: 30, name: "ÍBV" },
        awayTeam: { id: 10, name: "Víkingur" },
        liveStatus: "not_started",
      };

      mockedGetMatches.mockResolvedValueOnce({
        data: [apiMatch1, apiMatch2],
        error: null,
      });

      const user = userEvent.setup();
      render(<TodaysMatches />);

      const fetchButton = screen.getByRole("button", {
        name: /Sækja leiki í dag/i,
      });
      await user.click(fetchButton);

      await waitFor(() => {
        expect(mockedGetMatches).toHaveBeenCalledWith(
          expect.objectContaining({
            path: expect.objectContaining({ teamId: 2492 }) as unknown,
          }),
        );
      });

      const dt1 = new Date(apiMatch1.dateTimeUTC);
      const dt2 = new Date(apiMatch2.dateTimeUTC);
      const label1 = `${dt1.toLocaleDateString("is-IS")} ${dt1.toLocaleTimeString(
        "is-IS",
        {
          hour: "2-digit",
          minute: "2-digit",
        },
      )} ${apiMatch1.competition.name} [${apiMatch1.homeTeam.name} - ${apiMatch1.awayTeam.name}]`;
      const label2 = `${dt2.toLocaleDateString("is-IS")} ${dt2.toLocaleTimeString(
        "is-IS",
        {
          hour: "2-digit",
          minute: "2-digit",
        },
      )} ${apiMatch2.competition.name} [${apiMatch2.homeTeam.name} - ${apiMatch2.awayTeam.name}]`;

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: label1,
          }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", {
            name: label2,
          }),
        ).toBeInTheDocument();
      });
    });

    it("shows loading spinner during fetch", async () => {
      const mockImplementationFn = () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: [], error: null }), 100),
        );
      mockedGetMatches.mockImplementation(
        mockImplementationFn as ReturnType<typeof vi.fn>,
      );

      const user = userEvent.setup();
      render(<TodaysMatches />);

      const fetchButton = screen.getByRole("button", {
        name: /Sækja leiki í dag/i,
      });
      await user.click(fetchButton);

      expect(screen.getByTestId("ring-loader")).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByTestId("ring-loader")).not.toBeInTheDocument();
      });
    });

    it("displays error when fetch fails", async () => {
      mockedGetMatches.mockRejectedValueOnce(new Error("Network error"));

      const user = userEvent.setup();
      render(<TodaysMatches />);

      const fetchButton = screen.getByRole("button", {
        name: /Sækja leiki í dag/i,
      });
      await user.click(fetchButton);

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });
  });

  describe("fetchMatchReport", () => {
    let promptSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      promptSpy = vi.spyOn(window, "prompt");
    });

    afterEach(() => {
      promptSpy.mockRestore();
    });

    it("prompts for match ID and fetches report", async () => {
      promptSpy.mockReturnValue("123");

      const mockReportData = {
        home: { players: [], officials: [] },
        away: { players: [], officials: [] },
      };
      const mockPlayers: {
        home: Array<Record<string, unknown>>;
        away: Array<Record<string, unknown>>;
      } = {
        home: [{ name: "Player 1", number: 10, show: true }],
        away: [{ name: "Player 3", number: 9, show: true }],
      };
      const apiMatch = {
        id: 123,
        dateTimeUTC: "2024-01-15T19:00:00Z",
        competition: { id: 1, name: "U19" },
        homeTeam: { id: 10, name: "Víkingur" },
        awayTeam: { id: 20, name: "KR" },
        liveStatus: "not_started",
      };

      mockedGetLineups.mockResolvedValueOnce({
        data: mockReportData,
        error: null,
      });
      mockedGetMatches.mockResolvedValueOnce({
        data: [apiMatch],
        error: null,
      });
      mockedTransformLineups.mockReturnValue(mockPlayers);

      const user = userEvent.setup();
      render(<TodaysMatches />);

      const reportButton = screen.getByRole("button", {
        name: /Slá inn ID leikskýrslu/i,
      });
      await user.click(reportButton);

      expect(promptSpy).toHaveBeenCalledWith("ID á leikskýrslu");

      await waitFor(() => {
        expect(mockedGetLineups).toHaveBeenCalledWith(
          expect.objectContaining({
            path: expect.objectContaining({
              teamId: 2492,
              matchId: 123,
            }) as unknown,
          }),
        );
      });

      await waitFor(() => {
        expect(mockSetRoster).toHaveBeenCalledWith(
          expect.objectContaining({
            home: expect.any(Array) as unknown,
            away: expect.any(Array) as unknown,
          }),
        );
      });
    });
    it("does nothing when prompt is cancelled", async () => {
      promptSpy.mockReturnValue(null);

      const user = userEvent.setup();
      render(<TodaysMatches />);

      const reportButton = screen.getByRole("button", {
        name: /Slá inn ID leikskýrslu/i,
      });
      await user.click(reportButton);

      expect(promptSpy).toHaveBeenCalledWith("ID á leikskýrslu");
      expect(mockedGetLineups).not.toHaveBeenCalled();
    });

    it("does nothing when prompt returns empty string", async () => {
      promptSpy.mockReturnValue("");

      const user = userEvent.setup();
      render(<TodaysMatches />);

      const reportButton = screen.getByRole("button", {
        name: /Slá inn ID leikskýrslu/i,
      });
      await user.click(reportButton);

      expect(promptSpy).toHaveBeenCalledWith("ID á leikskýrslu");
      expect(mockedGetLineups).not.toHaveBeenCalled();
    });

    it("displays error when fetch fails", async () => {
      promptSpy.mockReturnValue("match-123");
      mockedGetLineups.mockRejectedValueOnce(new Error("API error"));

      const user = userEvent.setup();
      render(<TodaysMatches />);

      const reportButton = screen.getByRole("button", {
        name: /Slá inn ID leikskýrslu/i,
      });
      await user.click(reportButton);

      await waitFor(() => {
        expect(screen.getByText("API error")).toBeInTheDocument();
      });
    });

    it("calls updateMatch with ksiMatchId after successful fetch", async () => {
      promptSpy.mockReturnValue("123");

      const mockReportData = {
        home: { players: [], officials: [] },
        away: { players: [], officials: [] },
      };
      const mockPlayers: {
        home: Array<Record<string, unknown>>;
        away: Array<Record<string, unknown>>;
      } = {
        home: [{ name: "Player 1", number: 10, show: true }],
        away: [{ name: "Player 3", number: 9, show: true }],
      };
      const apiMatch = {
        id: 123,
        dateTimeUTC: "2024-01-15T19:00:00Z",
        competition: { id: 1, name: "U19" },
        homeTeam: { id: 10, name: "Víkingur" },
        awayTeam: { id: 20, name: "KR" },
        liveStatus: "not_started",
      };

      mockedGetLineups.mockResolvedValueOnce({
        data: mockReportData,
        error: null,
      });
      mockedGetMatches.mockResolvedValueOnce({
        data: [apiMatch],
        error: null,
      });
      mockedTransformLineups.mockReturnValue(mockPlayers);

      const user = userEvent.setup();
      render(<TodaysMatches />);

      const reportButton = screen.getByRole("button", {
        name: /Slá inn ID leikskýrslu/i,
      });
      await user.click(reportButton);

      await waitFor(() => {
        expect(mockUpdateMatch).toHaveBeenCalledWith(
          expect.objectContaining({ ksiMatchId: 123 }),
        );
      });
    });
  });

  describe("selectMatchHandler", () => {
    it("calls updateMatch with ksiMatchId matching selected match", async () => {
      const apiMatch = {
        id: 456,
        dateTimeUTC: "2024-01-15T19:00:00Z",
        competition: { id: 1, name: "Úrvalsdeild" },
        homeTeam: { id: 10, name: "Víkingur" },
        awayTeam: { id: 20, name: "KR" },
        liveStatus: "not_started",
      };

      const mockLineups = {
        home: { players: [], officials: [] },
        away: { players: [], officials: [] },
      };
      const mockPlayers: {
        home: Array<Record<string, unknown>>;
        away: Array<Record<string, unknown>>;
      } = {
        home: [{ name: "Player 1", number: 10, show: true }],
        away: [{ name: "Player 3", number: 9, show: true }],
      };

      mockedGetMatches.mockResolvedValueOnce({
        data: [apiMatch],
        error: null,
      });
      mockedGetLineups.mockResolvedValueOnce({
        data: mockLineups,
        error: null,
      });
      mockedTransformLineups.mockReturnValue(mockPlayers);

      const user = userEvent.setup();
      render(<TodaysMatches />);

      const fetchButton = screen.getByRole("button", {
        name: /Sækja leiki í dag/i,
      });
      await user.click(fetchButton);

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: new RegExp("Víkingur.*KR"),
          }),
        ).toBeInTheDocument();
      });

      const matchButton = screen.getByRole("button", {
        name: new RegExp("Víkingur.*KR"),
      });
      await user.click(matchButton);

      await waitFor(() => {
        expect(mockUpdateMatch).toHaveBeenCalledWith(
          expect.objectContaining({
            homeTeam: "Víkingur",
            awayTeam: "KR",
            ksiMatchId: 456,
          }),
        );
      });
    });
  });
});
