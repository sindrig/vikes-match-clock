import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AssetComponent from "./Asset";
import assetTypes from "./AssetTypes";

// Mock the Firebase context hooks
vi.mock("../../contexts/FirebaseStateContext", () => ({
  useController: vi.fn(),
  useView: vi.fn(),
  useClubOverrides: vi.fn(() => ({
    clubOverrides: {},
    saveClubOverride: vi.fn(),
    deleteClubOverride: vi.fn(),
  })),
}));

vi.mock("../../contexts/LocalStateContext", () => ({
  useAuth: vi.fn(),
}));

// Mock child components
vi.mock("./VideoPlayer", () => ({
  default: ({
    asset,
    onEnded,
  }: {
    asset: { key: string };
    onEnded?: () => void;
  }) => (
    <div data-testid="video-player">
      VideoPlayer: {asset.key}
      <button data-testid="video-ended" onClick={onEnded} />
    </div>
  ),
}));

vi.mock("./PlayerCard", () => ({
  default: ({
    asset,
    children,
    className,
  }: {
    asset: { key: string };
    children: React.ReactNode;
    className: string;
  }) => (
    <div data-testid="player-card" className={className}>
      PlayerCard: {asset.key}
      {children}
    </div>
  ),
}));

vi.mock("./MOTM", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="motm">MOTM: {children}</div>
  ),
}));

vi.mock("./Substitution", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="substitution">Substitution: {children}</div>
  ),
}));

vi.mock("react-youtube", () => ({
  default: ({ videoId }: { videoId: string }) => (
    <div data-testid="youtube" data-video-id={videoId}>
      YouTube: {videoId}
    </div>
  ),
}));

import { useController, useView } from "../../contexts/FirebaseStateContext";

const mockedUseController = vi.mocked(useController);
const mockedUseView = vi.mocked(useView);

describe("AssetComponent", () => {
  const mockCompleteAssetIfCurrent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockedUseController.mockReturnValue({
      controller: {
        activeQueueId: null,
        playing: false,
      },
      completeAssetIfCurrent: mockCompleteAssetIfCurrent,
    } as unknown as ReturnType<typeof useController>);

    mockedUseView.mockReturnValue({
      view: {
        vp: {
          style: { height: 1080, width: 1920 },
          name: "Test Viewport",
          key: "test-vp",
        },
      },
    } as unknown as ReturnType<typeof useView>);
  });

  describe("Null/Empty Asset", () => {
    it("returns null when asset is null", () => {
      const { container } = render(
        <AssetComponent
          asset={null as unknown as { type: string; key: string }}
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("returns null when asset is undefined", () => {
      const { container } = render(
        <AssetComponent
          asset={undefined as unknown as { type: string; key: string }}
        />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe("IMAGE Asset Type", () => {
    it("renders an img element for IMAGE type with url property", () => {
      const asset = {
        type: assetTypes.IMAGE,
        key: "test-key",
        url: "https://example.com/image.jpg",
      };

      render(<AssetComponent asset={asset} />);

      const img = screen.getByRole("img");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "https://example.com/image.jpg");
      expect(img).toHaveAttribute("alt", "test-key");
    });

    it("renders an img element for IMAGE type with key as src when url is missing", () => {
      const asset = {
        type: assetTypes.IMAGE,
        key: "https://example.com/key-image.jpg",
      };

      render(<AssetComponent asset={asset} />);

      const img = screen.getByRole("img");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "https://example.com/key-image.jpg");
    });

    it("applies correct styles to IMAGE element", () => {
      const asset = {
        type: assetTypes.IMAGE,
        key: "test-key",
        url: "https://example.com/image.jpg",
      };

      render(<AssetComponent asset={asset} />);

      const img = screen.getByRole("img");
      expect(img).toHaveStyle({ height: "100%", width: "100%" });
    });
  });

  describe("VIDEO Asset Type", () => {
    it("renders VideoPlayer component for VIDEO type", () => {
      const asset = {
        type: assetTypes.VIDEO,
        key: "video-key.mp4",
      };

      render(<AssetComponent asset={asset} />);

      const videoPlayer = screen.getByTestId("video-player");
      expect(videoPlayer).toBeInTheDocument();
      expect(videoPlayer).toHaveTextContent("VideoPlayer: video-key.mp4");
    });

    it("passes thumbnail prop to VideoPlayer", () => {
      const asset = {
        type: assetTypes.VIDEO,
        key: "video-key.mp4",
      };

      render(<AssetComponent asset={asset} thumbnail />);

      const videoPlayer = screen.getByTestId("video-player");
      expect(videoPlayer).toBeInTheDocument();
    });
  });

  describe("URL Asset Type (YouTube)", () => {
    it("renders YouTube component for valid YouTube URL", () => {
      const asset = {
        type: assetTypes.URL,
        key: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      };

      render(<AssetComponent asset={asset} />);

      const youtube = screen.getByTestId("youtube");
      expect(youtube).toBeInTheDocument();
      expect(youtube).toHaveAttribute("data-video-id", "dQw4w9WgXcQ");
    });

    it("renders link for YouTube URL in thumbnail mode", () => {
      const asset = {
        type: assetTypes.URL,
        key: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      };

      render(<AssetComponent asset={asset} thumbnail />);

      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute(
        "href",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      );
      expect(link).toHaveTextContent("Youtube:dQw4w9WgXcQ");
    });

    it("returns null for invalid URL", () => {
      const asset = {
        type: assetTypes.URL,
        key: "not-a-valid-url",
      };

      const { container } = render(<AssetComponent asset={asset} />);
      expect(container.firstChild).toBeNull();
    });

    it("returns null for non-YouTube URL", () => {
      const asset = {
        type: assetTypes.URL,
        key: "https://example.com/video",
      };

      const { container } = render(<AssetComponent asset={asset} />);
      expect(container.firstChild).toBeNull();
    });

    it("returns null for YouTube URL without video ID", () => {
      const asset = {
        type: assetTypes.URL,
        key: "https://www.youtube.com/watch",
      };

      const { container } = render(<AssetComponent asset={asset} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("PLAYER Asset Type", () => {
    it("renders PlayerCard component for PLAYER type", () => {
      const asset = {
        type: assetTypes.PLAYER,
        key: "https://example.com/player.jpg",
      };

      render(<AssetComponent asset={asset} />);

      const playerCard = screen.getByTestId("player-card");
      expect(playerCard).toBeInTheDocument();
      expect(playerCard).toHaveTextContent(
        "PlayerCard: https://example.com/player.jpg",
      );
    });

    it("renders PlayerCard with background image when provided", () => {
      const asset = {
        type: assetTypes.PLAYER,
        key: "https://example.com/player.jpg",
        background: "https://example.com/background.jpg",
      };

      render(<AssetComponent asset={asset} />);

      const playerCard = screen.getByTestId("player-card");
      expect(playerCard).toBeInTheDocument();

      const images = screen.getAllByRole("img");
      expect(images).toHaveLength(2); // background + player image
      expect(images[0]).toHaveAttribute(
        "src",
        "https://example.com/background.jpg",
      );
      expect(images[1]).toHaveAttribute(
        "src",
        "https://example.com/player.jpg",
      );
    });
  });

  describe("NO_IMAGE_PLAYER Asset Type", () => {
    it("renders PlayerCard component for NO_IMAGE_PLAYER type", () => {
      const asset = {
        type: assetTypes.NO_IMAGE_PLAYER,
        key: "player-no-image",
        teamName: "UnknownTeam",
      };

      render(<AssetComponent asset={asset} />);

      const playerCard = screen.getByTestId("player-card");
      expect(playerCard).toBeInTheDocument();
      expect(playerCard).toHaveClass("player-card-no-image");
    });

    it("renders PlayerCard with background for NO_IMAGE_PLAYER when provided", () => {
      const asset = {
        type: assetTypes.NO_IMAGE_PLAYER,
        key: "player-key",
        background: "https://example.com/background.jpg",
        teamName: "TestTeam",
      };

      render(<AssetComponent asset={asset} />);

      const playerCard = screen.getByTestId("player-card");
      expect(playerCard).toBeInTheDocument();
    });
  });

  describe("MOTM Asset Type", () => {
    it("renders MOTM wrapper with PlayerCard inside", () => {
      const asset = {
        type: assetTypes.MOTM,
        key: "https://example.com/motm-player.jpg",
        originalAssetType: assetTypes.PLAYER,
      };

      render(<AssetComponent asset={asset} />);

      const motm = screen.getByTestId("motm");
      expect(motm).toBeInTheDocument();

      const playerCard = screen.getByTestId("player-card");
      expect(playerCard).toBeInTheDocument();
    });

    it("uses originalAssetType for MOTM player rendering", () => {
      const asset = {
        type: assetTypes.MOTM,
        key: "https://example.com/motm-player.jpg",
        originalAssetType: assetTypes.NO_IMAGE_PLAYER,
        teamName: "TestTeam",
      };

      render(<AssetComponent asset={asset} />);

      const motm = screen.getByTestId("motm");
      expect(motm).toBeInTheDocument();

      const playerCard = screen.getByTestId("player-card");
      expect(playerCard).toBeInTheDocument();
      expect(playerCard).toHaveClass("player-card-no-image");
    });
  });

  describe("SUB Asset Type", () => {
    it("renders Substitution component with both players", () => {
      const asset = {
        type: assetTypes.SUB,
        key: "sub-key",
        subIn: {
          type: assetTypes.PLAYER,
          key: "https://example.com/player-in.jpg",
        },
        subOut: {
          type: assetTypes.PLAYER,
          key: "https://example.com/player-out.jpg",
        },
      };

      render(<AssetComponent asset={asset} />);

      const substitution = screen.getByTestId("substitution");
      expect(substitution).toBeInTheDocument();

      const playerCards = screen.getAllByTestId("player-card");
      expect(playerCards).toHaveLength(2);
    });

    it("returns null when subIn is missing", () => {
      const asset = {
        type: assetTypes.SUB,
        key: "sub-key",
        subOut: {
          type: assetTypes.PLAYER,
          key: "https://example.com/player-out.jpg",
        },
      };

      const { container } = render(<AssetComponent asset={asset} />);
      expect(container.firstChild).toBeNull();
    });

    it("returns null when subOut is missing", () => {
      const asset = {
        type: assetTypes.SUB,
        key: "sub-key",
        subIn: {
          type: assetTypes.PLAYER,
          key: "https://example.com/player-in.jpg",
        },
      };

      const { container } = render(<AssetComponent asset={asset} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("Unknown Asset Type", () => {
    it("returns null for unknown asset type", () => {
      const asset = {
        type: "UNKNOWN_TYPE",
        key: "unknown-key",
      };

      const { container } = render(<AssetComponent asset={asset} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("Passive rendering (auto-expiry)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("does NOT mutate shared state when a timed IMAGE local timer elapses", () => {
      const asset = {
        type: assetTypes.IMAGE,
        key: "test-key",
        url: "https://example.com/image.jpg",
      };

      render(<AssetComponent asset={asset} time={5} />);

      vi.advanceTimersByTime(5000);

      // Rendering is passive: the Asset component never issues a mutation.
      expect(mockCompleteAssetIfCurrent).not.toHaveBeenCalled();
    });

    it("renders URL assets without mutating state", () => {
      const asset = {
        type: assetTypes.URL,
        key: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      };

      render(<AssetComponent asset={asset} time={5} />);

      vi.advanceTimersByTime(5000);

      expect(mockCompleteAssetIfCurrent).not.toHaveBeenCalled();
    });

    it("renders VIDEO assets without mutating state on a plain render", () => {
      const asset = {
        type: assetTypes.VIDEO,
        key: "video.mp4",
      };

      render(<AssetComponent asset={asset} time={5} />);

      vi.advanceTimersByTime(5000);

      expect(mockCompleteAssetIfCurrent).not.toHaveBeenCalled();
    });

    it("renders thumbnails without mutating state", () => {
      const asset = {
        type: assetTypes.IMAGE,
        key: "test-key",
        url: "https://example.com/image.jpg",
      };

      render(<AssetComponent asset={asset} time={5} thumbnail />);

      vi.advanceTimersByTime(5000);

      expect(mockCompleteAssetIfCurrent).not.toHaveBeenCalled();
    });
  });

  describe("Media completion (video / YouTube end event)", () => {
    it("reports completion during active autoplay using the rendered controller's queue preconditions", () => {
      // The controller is actively autoplaying a queue (activeQueueId set,
      // playing true). The completion observation must carry these real
      // values — hard-coding null/false would fail the precondition and the
      // autoplay advance would be silently dropped.
      mockedUseController.mockReturnValue({
        controller: {
          activeQueueId: "queue-1",
          playing: true,
        },
        completeAssetIfCurrent: mockCompleteAssetIfCurrent,
      } as unknown as ReturnType<typeof useController>);

      const asset = {
        type: assetTypes.VIDEO,
        key: "video.mp4",
      };

      render(<AssetComponent asset={asset} time={3} />);

      fireEvent.click(screen.getByTestId("video-ended"));

      expect(mockCompleteAssetIfCurrent).toHaveBeenCalledTimes(1);
      expect(mockCompleteAssetIfCurrent).toHaveBeenCalledWith({
        assetKey: "video.mp4",
        time: 3,
        activeQueueId: "queue-1",
        playing: true,
      });
    });
  });
});
