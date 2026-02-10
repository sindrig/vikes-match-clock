import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Clock from "./Clock";
import { LocalStateProvider } from "../contexts/LocalStateContext";
import { FirebaseStateProvider } from "../contexts/FirebaseStateContext";

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <LocalStateProvider>
      <FirebaseStateProvider
        sync={false}
        listenPrefix=""
        isAuthenticated={false}
      >
        {component}
      </FirebaseStateProvider>
    </LocalStateProvider>,
  );
};

describe("Clock component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("rendering", () => {
    it("renders with initial time 00:00 when not started", () => {
      renderWithProviders(<Clock className="matchclock" />);

      expect(screen.getByText("00:00")).toBeInTheDocument();
    });

    it("renders with the provided className", () => {
      const { container } = renderWithProviders(
        <Clock className="matchclock" />,
      );

      expect(container.querySelector(".matchclock")).toBeInTheDocument();
    });

    it("displays 00:00 with default context state (no timeElapsed)", () => {
      renderWithProviders(<Clock className="matchclock" />);

      expect(screen.getByText("00:00")).toBeInTheDocument();
    });
  });

  describe("clock display format", () => {
    it("displays time in MM:SS format", () => {
      renderWithProviders(<Clock className="matchclock" />);

      const clockElement = screen.getByText(/\d+:\d+/);
      expect(clockElement).toBeInTheDocument();
    });

    it("applies custom className to clock element", () => {
      const { container } = renderWithProviders(
        <Clock className="custom-clock" />,
      );

      expect(container.querySelector(".custom-clock")).toBeInTheDocument();
    });
  });

  describe("clock element structure", () => {
    it("renders a single clock element", () => {
      const { container } = renderWithProviders(
        <Clock className="matchclock" />,
      );

      const clockElements = container.querySelectorAll(".matchclock");
      expect(clockElements).toHaveLength(1);
    });

    it("renders clock with style attribute for font-size", () => {
      const { container } = renderWithProviders(
        <Clock className="matchclock" />,
      );

      const clock = container.querySelector(".matchclock");
      expect(clock).toHaveStyle({ fontSize: "1.85rem" });
    });
  });
});
