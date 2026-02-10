import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LocalStateProvider } from "../contexts/LocalStateContext";
import { FirebaseStateProvider } from "../contexts/FirebaseStateContext";
import MatchController from "./MatchController";

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <LocalStateProvider>
      <FirebaseStateProvider
        sync={false}
        listenPrefix=""
        isAuthenticated={false}
      >
        {ui}
      </FirebaseStateProvider>
    </LocalStateProvider>,
  );
};

describe("MatchController component", () => {
  describe("rendering", () => {
    it("renders without crashing", () => {
      const { container } = renderWithProviders(<MatchController />);

      expect(container.querySelector(".match-controller")).toBeInTheDocument();
    });

    it("renders Start button when match is not started", () => {
      renderWithProviders(<MatchController />);

      expect(screen.getByText("Start")).toBeInTheDocument();
    });

    it("renders Leiðrétta button", () => {
      renderWithProviders(<MatchController />);

      expect(screen.getByText("Leiðrétta")).toBeInTheDocument();
    });
  });

  describe("button interactions", () => {
    it("can click Start button when match is not started", () => {
      renderWithProviders(<MatchController />);

      fireEvent.click(screen.getByText("Start"));
    });

    it("can click Leiðrétta button", () => {
      renderWithProviders(<MatchController />);

      fireEvent.click(screen.getByText("Leiðrétta"));
    });
  });

  describe("button states", () => {
    it("Start button is enabled when no timeout (default state)", () => {
      renderWithProviders(<MatchController />);

      const startButton = screen.getByText("Start");
      expect(startButton).not.toBeDisabled();
    });
  });

  describe("team controllers", () => {
    it("renders home team controller", () => {
      const { container } = renderWithProviders(<MatchController />);

      expect(
        container.querySelector(".match-controller-box-home"),
      ).toBeInTheDocument();
    });

    it("renders away team controller", () => {
      const { container } = renderWithProviders(<MatchController />);

      expect(
        container.querySelector(".match-controller-box-away"),
      ).toBeInTheDocument();
    });

    it("renders Mark buttons for both teams", () => {
      renderWithProviders(<MatchController />);

      const markButtons = screen.getAllByText("Mark");
      expect(markButtons).toHaveLength(2);
    });

    it("renders Brottvísun buttons for both teams", () => {
      renderWithProviders(<MatchController />);

      const redCardButtons = screen.getAllByText("Brottvísun");
      expect(redCardButtons).toHaveLength(2);
    });

    it("renders Leikhlé buttons for both teams", () => {
      renderWithProviders(<MatchController />);

      const timeoutButtons = screen.getAllByText("Leikhlé");
      expect(timeoutButtons).toHaveLength(2);
    });
  });
});
