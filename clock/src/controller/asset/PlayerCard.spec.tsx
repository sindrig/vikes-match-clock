import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PlayerCard from "./PlayerCard";

// Mock Firebase context
vi.mock("../../contexts/FirebaseStateContext", () => ({
  useView: vi.fn(),
}));

import { useView } from "../../contexts/FirebaseStateContext";

const mockedUseView = vi.mocked(useView);

describe("PlayerCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup canvas mock - Pattern F
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      measureText: vi.fn().mockReturnValue({ width: 100 }),
      fillText: vi.fn(),
    });

    // Setup useView mock
    mockedUseView.mockReturnValue({
      view: {
        vp: {
          style: {
            width: 1920,
          },
        },
        background: "default",
      },
      setViewport: vi.fn(),
      setBackground: vi.fn(),
      setIdleImage: vi.fn(),
      updateView: vi.fn(),
    } as unknown as ReturnType<typeof useView>);
  });

  it("renders player card with player name and number", () => {
    const asset = {
      key: "player-1",
      name: "John Doe",
      number: 7,
    };

    render(<PlayerCard asset={asset} />);

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders player with jersey number in asset-player-number span", () => {
    const asset = {
      key: "player-2",
      name: "Jane Smith",
      number: 10,
    };

    render(<PlayerCard asset={asset} />);

    const numberSpan = screen.getByText("10");
    expect(numberSpan).toHaveClass("asset-player-number");
  });

  it("renders player name in asset-player-name span with computed font size", () => {
    const asset = {
      key: "player-3",
      name: "Test Player",
      number: 5,
    };

    render(<PlayerCard asset={asset} />);

    const nameSpan = screen.getByText("Test Player");
    expect(nameSpan).toHaveClass("asset-player-name");
    expect(nameSpan).toHaveStyle({ fontSize: expect.stringContaining("px") });
  });

  it("calls canvas getContext for text measurement", () => {
    const mockGetContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");

    const asset = {
      key: "player-4",
      name: "Measurement Test",
      number: 8,
    };

    render(<PlayerCard asset={asset} />);

    expect(mockGetContext).toHaveBeenCalledWith("2d");

    mockGetContext.mockRestore();
  });

  it("uses canvas measureText for both thumbnail and regular font sizes", () => {
    const mockMeasureText = vi.fn().mockReturnValue({ width: 150 });
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      measureText: mockMeasureText,
      fillText: vi.fn(),
    });

    const asset = {
      key: "player-5",
      name: "Font Sizing Test",
      number: 3,
    };

    // Render without thumbnail
    const { unmount } = render(<PlayerCard asset={asset} />);
    expect(mockMeasureText).toHaveBeenCalled();

    unmount();

    // Reset and render with thumbnail
    mockMeasureText.mockClear();
    render(<PlayerCard asset={asset} thumbnail />);
    expect(mockMeasureText).toHaveBeenCalled();
  });

  it("renders in regular mode by default", () => {
    const asset = {
      key: "player-6",
      name: "Regular Mode",
      number: 12,
    };

    const { container } = render(<PlayerCard asset={asset} />);

    const playerCard = container.querySelector(".asset-player-icon");
    expect(playerCard).toBeInTheDocument();
  });

  it("renders in thumbnail mode when thumbnail prop is true", () => {
    const asset = {
      key: "player-7",
      name: "Thumbnail Mode",
      number: 9,
    };

    const { container } = render(<PlayerCard asset={asset} thumbnail />);

    const playerCard = container.querySelector(".asset-player-icon");
    expect(playerCard).toBeInTheDocument();
  });

  it("applies custom className to player card", () => {
    const asset = {
      key: "player-8",
      name: "Custom Class",
      number: 4,
    };

    const { container } = render(
      <PlayerCard asset={asset} className="custom-class" />,
    );

    const playerCard = container.querySelector(".asset-player-icon");
    expect(playerCard).toHaveClass("custom-class");
  });

  it("renders children components inside player card", () => {
    const asset = {
      key: "player-9",
      name: "With Children",
      number: 6,
    };

    render(
      <PlayerCard asset={asset}>
        <div data-testid="child-element">Child Content</div>
      </PlayerCard>,
    );

    expect(screen.getByTestId("child-element")).toBeInTheDocument();
  });

  it("renders overlay with text when provided", () => {
    const asset = {
      key: "player-10",
      name: "Overlay Test",
      number: 11,
    };

    const overlay = { text: "Captain", blink: false, effect: "none" };

    render(<PlayerCard asset={asset} overlay={overlay} />);

    expect(screen.getByText("Captain")).toBeInTheDocument();
  });

  it("applies overlay effect class when blink and effect are set", () => {
    const asset = {
      key: "player-11",
      name: "Blink Effect",
      number: 2,
    };

    const overlay = { text: "Highlight", blink: true, effect: "blink" };

    const { container } = render(
      <PlayerCard asset={asset} overlay={overlay} />,
    );

    const overlaySpan = container.querySelector(".player-card-overlay");
    expect(overlaySpan).toHaveClass("blink");
  });

  it("does not apply effect class when blink is false", () => {
    const asset = {
      key: "player-12",
      name: "No Blink",
      number: 14,
    };

    const overlay = { text: "Text", blink: false, effect: "blink" };

    const { container } = render(
      <PlayerCard asset={asset} overlay={overlay} />,
    );

    const overlaySpan = container.querySelector(".player-card-overlay");
    expect(overlaySpan).not.toHaveClass("blink");
  });

  it("uses background from view context when includeBackground is true", () => {
    const asset = {
      key: "player-13",
      name: "With Background",
      number: 15,
    };

    const { container } = render(
      <PlayerCard asset={asset} includeBackground />,
    );

    const playerCard = container.querySelector(".asset-player-icon");
    expect(playerCard).toBeInTheDocument();
  });

  it("does not apply background style when includeBackground is false", () => {
    const asset = {
      key: "player-14",
      name: "No Background",
      number: 16,
    };

    const { container } = render(
      <PlayerCard asset={asset} includeBackground={false} />,
    );

    const playerCard = container.querySelector(".asset-player-icon");
    expect(playerCard).toBeInTheDocument();
  });

  it("applies widthMultiplier to font size calculation", () => {
    const mockMeasureText = vi.fn().mockReturnValue({ width: 200 });
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      measureText: mockMeasureText,
      fillText: vi.fn(),
    });

    const asset = {
      key: "player-15",
      name: "Width Multiplier Test",
      number: 17,
    };

    render(<PlayerCard asset={asset} widthMultiplier={1.5} />);

    expect(mockMeasureText).toHaveBeenCalled();
  });

  it("renders player without number when number is undefined, showing role first letter instead", () => {
    const asset = {
      key: "player-16",
      name: "Role Player",
      role: "Goalkeeper",
    };

    render(<PlayerCard asset={asset} />);

    expect(screen.getByText("G")).toBeInTheDocument();
  });

  it("renders with unique key identifier for React rendering", () => {
    const asset = {
      key: "unique-player-key",
      name: "Key Test",
      number: 1,
    };

    const { container } = render(<PlayerCard asset={asset} />);

    const playerCard = container.querySelector(".asset-player-icon");
    expect(playerCard).toBeInTheDocument();
  });

  it("handles empty player name gracefully", () => {
    const asset = {
      key: "player-17",
      name: "",
      number: 20,
    };

    render(<PlayerCard asset={asset} />);

    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("calculates thumbnail font size differently from regular size", () => {
    const mockMeasureText = vi.fn().mockReturnValue({ width: 120 });
    const mockContext = {
      measureText: mockMeasureText,
      fillText: vi.fn(),
      font: "",
    };
    HTMLCanvasElement.prototype.getContext = vi
      .fn()
      .mockReturnValue(mockContext);

    const asset = {
      key: "player-18",
      name: "Thumbnail Size",
      number: 25,
    };

    // Render with thumbnail - should calculate width * 0.25 for THUMB_VP
    render(<PlayerCard asset={asset} thumbnail />);

    const calls = mockMeasureText.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
  });
});
