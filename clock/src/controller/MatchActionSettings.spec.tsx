import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import MatchActionSettings from "./MatchActionSettings";
import { Sports, VIEWS, BACKGROUNDS } from "../constants";

vi.mock("../contexts/FirebaseStateContext", () => ({
  useMatch: vi.fn(),
  useController: vi.fn(),
  useView: vi.fn(),
}));

import {
  useMatch,
  useController,
  useView,
} from "../contexts/FirebaseStateContext";

const mockedUseMatch = vi.mocked(useMatch);
const mockedUseController = vi.mocked(useController);
const mockedUseView = vi.mocked(useView);

describe("MatchActionSettings", () => {
  let mockUpdateMatch: ReturnType<typeof vi.fn>;
  let mockSetBackground: ReturnType<typeof vi.fn>;
  let mockSetIdleImage: ReturnType<typeof vi.fn>;
  let mockUpdateHalfLength: ReturnType<typeof vi.fn>;
  let mockSetHalfStops: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateMatch = vi.fn();
    mockSetBackground = vi.fn();
    mockSetIdleImage = vi.fn();
    mockUpdateHalfLength = vi.fn();
    mockSetHalfStops = vi.fn();

    mockedUseMatch.mockReturnValue({
      match: {
        matchStartTime: "15:00",
        matchType: Sports.Football,
        halfStops: [45, 90],
        showInjuryTime: false,
      },
      updateMatch: mockUpdateMatch,
      updateHalfLength: mockUpdateHalfLength,
      setHalfStops: mockSetHalfStops,
    } as unknown as ReturnType<typeof useMatch>);

    mockedUseController.mockReturnValue({
      controller: {
        view: VIEWS.match,
      },
    } as unknown as ReturnType<typeof useController>);

    mockedUseView.mockReturnValue({
      view: {
        background: "Default",
        idleImage: "null",
      },
      setBackground: mockSetBackground,
      setIdleImage: mockSetIdleImage,
    } as unknown as ReturnType<typeof useView>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Initial Render", () => {
    it("renders match start time input with default value from match state", () => {
      render(<MatchActionSettings />);

      const input = screen.getByDisplayValue("15:00");
      expect(input).toBeInTheDocument();
      expect(input).toHaveClass("match-start-time-selector");
    });

    it("renders match type select with default value from match state", () => {
      render(<MatchActionSettings />);

      const select = screen.getByDisplayValue(Sports.Football);
      expect(select).toBeInTheDocument();
      expect(select).toHaveClass("match-type-selector");
    });

    it("renders background select with correct class", () => {
      render(<MatchActionSettings />);

      const select = document.querySelector(".background-selector");
      expect(select).toBeInTheDocument();
      expect(select).toBeInstanceOf(HTMLSelectElement);
    });

    it("renders idle logo select with default value from view state", () => {
      render(<MatchActionSettings />);

      const select = screen.getByDisplayValue("No idle screen between images");
      expect(select).toBeInTheDocument();
      expect(select).toHaveClass("idle-selector");
    });
  });

  describe("Form Input Changes", () => {
    it("calls updateMatch when match start time input changes", () => {
      render(<MatchActionSettings />);

      const input = screen.getByDisplayValue("15:00");
      fireEvent.change(input, { target: { value: "16:30" } });

      expect(mockUpdateMatch).toHaveBeenCalledWith({ matchStartTime: "16:30" });
    });

    it("calls updateMatch with Sports type when match type select changes", () => {
      render(<MatchActionSettings />);

      const select = screen.getByDisplayValue(Sports.Football);
      fireEvent.change(select, { target: { value: Sports.Handball } });

      expect(mockUpdateMatch).toHaveBeenCalledWith({
        matchType: Sports.Handball,
      });
    });

    it("calls setBackground when background select changes", () => {
      render(<MatchActionSettings />);

      const select = document.querySelector(
        ".background-selector",
      ) as HTMLSelectElement;
      expect(select).toBeInTheDocument();

      const availableBackgrounds = Object.keys(BACKGROUNDS);
      if (availableBackgrounds.length > 1) {
        const newBackground = availableBackgrounds[1];
        fireEvent.change(select, { target: { value: newBackground } });

        expect(mockSetBackground).toHaveBeenCalledWith(newBackground);
      }
    });

    it("calls setIdleImage when idle logo select changes", () => {
      render(<MatchActionSettings />);

      const select = screen.getByDisplayValue("No idle screen between images");
      const newValue = "";
      fireEvent.change(select, { target: { value: newValue } });

      expect(mockSetIdleImage).toHaveBeenCalledWith(newValue);
    });
  });

  describe("Form Values with Different Match States", () => {
    it("updates input value when match state changes", () => {
      const { rerender } = render(<MatchActionSettings />);

      expect(screen.getByDisplayValue("15:00")).toBeInTheDocument();

      mockedUseMatch.mockReturnValue({
        match: {
          matchStartTime: "17:45",
          matchType: Sports.Football,
          halfStops: [45, 90],
          showInjuryTime: false,
        },
        updateMatch: mockUpdateMatch,
        updateHalfLength: mockUpdateHalfLength,
        setHalfStops: mockSetHalfStops,
      } as unknown as ReturnType<typeof useMatch>);

      rerender(<MatchActionSettings />);

      expect(screen.getByDisplayValue("17:45")).toBeInTheDocument();
    });

    it("renders with Handball match type when match state specifies it", () => {
      mockedUseMatch.mockReturnValue({
        match: {
          matchStartTime: "15:00",
          matchType: Sports.Handball,
          halfStops: [30, 60],
          showInjuryTime: false,
        },
        updateMatch: mockUpdateMatch,
        updateHalfLength: mockUpdateHalfLength,
        setHalfStops: mockSetHalfStops,
      } as unknown as ReturnType<typeof useMatch>);

      render(<MatchActionSettings />);

      const select = screen.getByDisplayValue(Sports.Handball);
      expect(select).toBeInTheDocument();
    });
  });

  describe("View State Integration", () => {
    it("updates background select when view state background changes", () => {
      const { rerender } = render(<MatchActionSettings />);

      const select = document.querySelector(
        ".background-selector",
      ) as HTMLSelectElement;
      expect(select).toBeInTheDocument();

      const newBackground = Object.keys(BACKGROUNDS)[0];
      mockedUseView.mockReturnValue({
        view: {
          background: newBackground,
          idleImage: "null",
        },
        setBackground: mockSetBackground,
        setIdleImage: mockSetIdleImage,
      } as unknown as ReturnType<typeof useView>);

      rerender(<MatchActionSettings />);

      const updatedSelect = document.querySelector(
        ".background-selector",
      ) as HTMLSelectElement;
      expect(updatedSelect.value).toBe(newBackground);
    });
  });

  describe("Control View Conditional Rendering", () => {
    it("does not render HalfStops when view is not match", () => {
      mockedUseController.mockReturnValue({
        controller: {
          view: VIEWS.idle,
        },
      } as unknown as ReturnType<typeof useController>);

      const { container } = render(<MatchActionSettings />);

      expect(container.innerHTML).not.toContain("HalfStops");
    });

    it("renders team selectors for both home and away teams", () => {
      const { container } = render(<MatchActionSettings />);

      const teamSelectors = container.querySelectorAll(
        "div[class='control-item']",
      );
      expect(teamSelectors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Multiple Form Changes", () => {
    it("calls updateMatch multiple times for sequential changes", () => {
      render(<MatchActionSettings />);

      const startTimeInput = screen.getByDisplayValue("15:00");
      fireEvent.change(startTimeInput, { target: { value: "18:00" } });
      fireEvent.change(startTimeInput, { target: { value: "19:00" } });

      expect(mockUpdateMatch).toHaveBeenCalledTimes(2);
      expect(mockUpdateMatch).toHaveBeenNthCalledWith(1, {
        matchStartTime: "18:00",
      });
      expect(mockUpdateMatch).toHaveBeenNthCalledWith(2, {
        matchStartTime: "19:00",
      });
    });
  });
});
