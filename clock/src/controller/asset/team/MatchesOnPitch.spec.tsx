import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import MatchesOnPitch from "./MatchesOnPitch";
import apiConfig from "../../../apiConfig";

// Mock axios
vi.mock("axios");
const mockedAxios = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
};

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

const mockedUseController = vi.mocked(useController);
const mockedUseMatch = vi.mocked(useMatch);
const mockedUseListeners = vi.mocked(useListeners);
const mockedUseRemoteSettings = vi.mocked(useRemoteSettings);

describe("MatchesOnPitch", () => {
  const mockSetAvailableMatches = vi.fn();
  const mockUpdateMatch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockedUseController.mockReturnValue({
      setAvailableMatches: mockSetAvailableMatches,
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
  });

  describe("Initial render", () => {
    it("renders initial state with two action buttons", () => {
      render(<MatchesOnPitch />);

      expect(
        screen.getByRole("button", { name: /Sækja leiki á velli/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Slá inn ID leikskýrslu/i }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("ring-loader")).not.toBeInTheDocument();
    });

    it("does not show error message initially", () => {
      render(<MatchesOnPitch />);

      const errorSpan = screen.getByText("", { selector: "span.error" });
      expect(errorSpan).toBeInTheDocument();
      expect(errorSpan.textContent).toBe("");
    });
  });

  describe("fetchMatchesOnPitch", () => {
    it("fetches and displays matches on button click", async () => {
      const mockMatches = [
        {
          match_id: "match-1",
          date: "2024-01-15",
          time: "19:00",
          competition: "Úrvalsdeild",
          home: { name: "Víkingur" },
          away: { name: "KR" },
        },
        {
          match_id: "match-2",
          date: "2024-01-20",
          time: "15:00",
          competition: "Bikarinn",
          home: { name: "ÍBV" },
          away: { name: "Víkingur" },
        },
      ];

      mockedAxios.get.mockResolvedValueOnce({
        data: { matches: mockMatches },
      });

      const user = userEvent.setup();
      render(<MatchesOnPitch />);

      const fetchButton = screen.getByRole("button", {
        name: /Sækja leiki á velli/i,
      });
      await user.click(fetchButton);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          `${apiConfig.gateWayUrl}match-report/v2`,
          {
            params: {
              location: "pitch-123",
              action: "get-matches",
            },
          },
        );
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: /2024-01-15 19:00 Úrvalsdeild \[Víkingur - KR\]/i,
          }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", {
            name: /2024-01-20 15:00 Bikarinn \[ÍBV - Víkingur\]/i,
          }),
        ).toBeInTheDocument();
      });
    });

    it("shows loading spinner during fetch", async () => {
      const mockImplementationFn = () =>
        new Promise<{ data: { matches: unknown[] } }>((resolve) =>
          setTimeout(() => resolve({ data: { matches: [] } }), 100),
        );
      mockedAxios.get.mockImplementation(
        mockImplementationFn as ReturnType<typeof vi.fn>,
      );

      const user = userEvent.setup();
      render(<MatchesOnPitch />);

      const fetchButton = screen.getByRole("button", {
        name: /Sækja leiki á velli/i,
      });
      await user.click(fetchButton);

      expect(screen.getByTestId("ring-loader")).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByTestId("ring-loader")).not.toBeInTheDocument();
      });
    });

    it("displays error when fetch fails", async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error("Network error"));

      const user = userEvent.setup();
      render(<MatchesOnPitch />);

      const fetchButton = screen.getByRole("button", {
        name: /Sækja leiki á velli/i,
      });
      await user.click(fetchButton);

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });

    it("displays error when no screen is found", async () => {
      mockedUseListeners.mockReturnValue({
        screens: [
          {
            screen: {
              style: { height: 1080, width: 1920 },
              name: "Other Screen",
              key: "other-screen",
            },
            label: "Other Screen",
            key: "other-key",
            pitchIds: ["other-pitch"],
          },
        ],
      } as unknown as ReturnType<typeof useListeners>);

      const user = userEvent.setup();
      render(<MatchesOnPitch />);

      const fetchButton = screen.getByRole("button", {
        name: /Sækja leiki á velli/i,
      });
      await user.click(fetchButton);

      await waitFor(() => {
        expect(screen.getByText("No screen found")).toBeInTheDocument();
      });

      expect(mockedAxios.get).not.toHaveBeenCalled();
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
      promptSpy.mockReturnValue("match-123");

      const mockReportData = {
        players: {
          home: [
            { name: "Player 1", number: 10 },
            { name: "Player 2", number: 7 },
          ],
          away: [{ name: "Player 3", number: 9 }],
        },
        group: "U19",
        sex: "M",
      };

      mockedAxios.get.mockResolvedValueOnce({
        data: mockReportData,
      });

      const user = userEvent.setup();
      render(<MatchesOnPitch />);

      const reportButton = screen.getByRole("button", {
        name: /Slá inn ID leikskýrslu/i,
      });
      await user.click(reportButton);

      expect(promptSpy).toHaveBeenCalledWith("ID á leikskýrslu");

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          `${apiConfig.gateWayUrl}match-report/v2`,
          {
            params: {
              matchId: "match-123",
              action: "get-report",
            },
          },
        );
      });

      await waitFor(() => {
        expect(mockSetAvailableMatches).toHaveBeenCalledWith({
          "match-123": {
            players: mockReportData.players,
            group: mockReportData.group,
            sex: mockReportData.sex,
          },
        });
      });
    });

    it("does nothing when prompt is cancelled", async () => {
      promptSpy.mockReturnValue(null);

      const user = userEvent.setup();
      render(<MatchesOnPitch />);

      const reportButton = screen.getByRole("button", {
        name: /Slá inn ID leikskýrslu/i,
      });
      await user.click(reportButton);

      expect(promptSpy).toHaveBeenCalledWith("ID á leikskýrslu");
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it("does nothing when prompt returns empty string", async () => {
      promptSpy.mockReturnValue("");

      const user = userEvent.setup();
      render(<MatchesOnPitch />);

      const reportButton = screen.getByRole("button", {
        name: /Slá inn ID leikskýrslu/i,
      });
      await user.click(reportButton);

      expect(promptSpy).toHaveBeenCalledWith("ID á leikskýrslu");
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it("displays error when fetch fails", async () => {
      promptSpy.mockReturnValue("match-123");
      mockedAxios.get.mockRejectedValueOnce(new Error("API error"));

      const user = userEvent.setup();
      render(<MatchesOnPitch />);

      const reportButton = screen.getByRole("button", {
        name: /Slá inn ID leikskýrslu/i,
      });
      await user.click(reportButton);

      await waitFor(() => {
        expect(screen.getByText("API error")).toBeInTheDocument();
      });
    });
  });
});
