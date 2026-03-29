import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PlaybackBar from "./PlaybackBar";
import { useController } from "../../../contexts/FirebaseStateContext";
import { ControllerState, QueueState } from "../../../types";

vi.mock("../../../contexts/FirebaseStateContext", () => ({
  useController: vi.fn(),
}));

const mockedUseController = vi.mocked(useController);

function makeQueue(overrides?: Partial<QueueState>): QueueState {
  return {
    id: "queue-1",
    name: "Test Queue",
    items: [
      { key: "img1", type: "IMAGE" },
      { key: "img2", type: "IMAGE" },
      { key: "img3", type: "IMAGE" },
    ],
    autoPlay: false,
    imageSeconds: 3,
    cycle: true,
    order: 0,
    ...overrides,
  };
}

function makeControllerState(
  overrides?: Partial<ControllerState>,
): ControllerState {
  return {
    queues: {},
    activeQueueId: null,
    playing: false,
    assetView: "assets",
    view: "idle",
    roster: { home: [], away: [] },
    currentAsset: null,
    refreshToken: "",
    ...overrides,
  };
}

function setupMock(
  controllerOverrides?: Partial<ControllerState>,
  actionOverrides?: {
    showNextAsset?: ReturnType<typeof vi.fn>;
    updateController?: ReturnType<typeof vi.fn>;
  },
) {
  const showNextAsset = actionOverrides?.showNextAsset ?? vi.fn();
  const updateController = actionOverrides?.updateController ?? vi.fn();

  mockedUseController.mockReturnValue({
    controller: makeControllerState(controllerOverrides),
    showNextAsset,
    updateController,
  } as unknown as ReturnType<typeof useController>);

  return { showNextAsset, updateController };
}

describe("PlaybackBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("visibility", () => {
    it("renders nothing when no active queue and no current asset", () => {
      setupMock({ activeQueueId: null, currentAsset: null, queues: {} });

      const { container } = render(<PlaybackBar />);

      expect(container.innerHTML).toBe("");
    });

    it("renders when an active queue exists", () => {
      const queue = makeQueue();
      setupMock({
        activeQueueId: "queue-1",
        queues: { "queue-1": queue },
        currentAsset: { asset: { key: "img0", type: "IMAGE" }, time: null },
      });

      render(<PlaybackBar />);

      expect(screen.getByTestId("playback-bar")).toBeInTheDocument();
    });

    it("renders when activeQueueId is set but queue was deleted (currentAsset present)", () => {
      setupMock({
        activeQueueId: "deleted-queue",
        queues: {},
        currentAsset: { asset: { key: "img0", type: "IMAGE" }, time: null },
      });

      render(<PlaybackBar />);

      expect(screen.getByTestId("playback-bar")).toBeInTheDocument();
    });

    it("renders nothing when activeQueueId is set but queue deleted and no current asset", () => {
      setupMock({
        activeQueueId: "deleted-queue",
        queues: {},
        currentAsset: null,
      });

      const { container } = render(<PlaybackBar />);

      expect(container.innerHTML).toBe("");
    });
  });

  describe("queue info display", () => {
    it("displays the queue name", () => {
      const queue = makeQueue({ name: "Sponsors" });
      setupMock({
        activeQueueId: "queue-1",
        queues: { "queue-1": queue },
        currentAsset: { asset: { key: "img0", type: "IMAGE" }, time: null },
      });

      render(<PlaybackBar />);

      expect(screen.getByText("Sponsors")).toBeInTheDocument();
    });

    it("displays remaining item count", () => {
      const queue = makeQueue({
        items: [
          { key: "img1", type: "IMAGE" },
          { key: "img2", type: "IMAGE" },
        ],
      });
      setupMock({
        activeQueueId: "queue-1",
        queues: { "queue-1": queue },
        currentAsset: { asset: { key: "img0", type: "IMAGE" }, time: null },
      });

      render(<PlaybackBar />);

      expect(screen.getByText("2 eftir")).toBeInTheDocument();
    });

    it("displays 0 remaining when queue is empty", () => {
      const queue = makeQueue({ items: [] });
      setupMock({
        activeQueueId: "queue-1",
        queues: { "queue-1": queue },
        currentAsset: { asset: { key: "img0", type: "IMAGE" }, time: null },
      });

      render(<PlaybackBar />);

      expect(screen.getByText("0 eftir")).toBeInTheDocument();
    });

    it("displays empty name when queue was deleted but currentAsset is present", () => {
      setupMock({
        activeQueueId: "deleted-queue",
        queues: {},
        currentAsset: { asset: { key: "img0", type: "IMAGE" }, time: null },
      });

      render(<PlaybackBar />);

      const nameEl = screen
        .getByTestId("playback-bar")
        .querySelector(".playback-bar-name");
      expect(nameEl).toHaveTextContent("");
    });
  });

  describe("Next button", () => {
    it("calls showNextAsset when clicked", () => {
      const queue = makeQueue({
        items: [{ key: "img1", type: "IMAGE" }],
      });
      const { showNextAsset } = setupMock({
        activeQueueId: "queue-1",
        queues: { "queue-1": queue },
        currentAsset: { asset: { key: "img0", type: "IMAGE" }, time: null },
      });

      render(<PlaybackBar />);
      fireEvent.click(screen.getByLabelText("Next in queue"));

      expect(showNextAsset).toHaveBeenCalledOnce();
    });

    it("is enabled when queue has remaining items", () => {
      const queue = makeQueue({
        items: [{ key: "img1", type: "IMAGE" }],
      });
      setupMock({
        activeQueueId: "queue-1",
        queues: { "queue-1": queue },
        currentAsset: { asset: { key: "img0", type: "IMAGE" }, time: null },
      });

      render(<PlaybackBar />);

      expect(screen.getByLabelText("Next in queue")).not.toBeDisabled();
    });

    it("is enabled when queue is empty but cycling", () => {
      const queue = makeQueue({ items: [], cycle: true });
      setupMock({
        activeQueueId: "queue-1",
        queues: { "queue-1": queue },
        currentAsset: { asset: { key: "img0", type: "IMAGE" }, time: null },
      });

      render(<PlaybackBar />);

      expect(screen.getByLabelText("Next in queue")).not.toBeDisabled();
    });

    it("is disabled when queue is empty and not cycling", () => {
      const queue = makeQueue({ items: [], cycle: false });
      setupMock({
        activeQueueId: "queue-1",
        queues: { "queue-1": queue },
        currentAsset: { asset: { key: "img0", type: "IMAGE" }, time: null },
      });

      render(<PlaybackBar />);

      expect(screen.getByLabelText("Next in queue")).toBeDisabled();
    });

    it("is disabled when queue was deleted (no active queue)", () => {
      setupMock({
        activeQueueId: "deleted-queue",
        queues: {},
        currentAsset: { asset: { key: "img0", type: "IMAGE" }, time: null },
      });

      render(<PlaybackBar />);

      expect(screen.getByLabelText("Next in queue")).toBeDisabled();
    });
  });

  describe("Stop button", () => {
    it("calls updateController to clear playback state", () => {
      const queue = makeQueue();
      const { updateController } = setupMock({
        activeQueueId: "queue-1",
        queues: { "queue-1": queue },
        playing: true,
        currentAsset: { asset: { key: "img0", type: "IMAGE" }, time: 3 },
      });

      render(<PlaybackBar />);
      fireEvent.click(screen.getByLabelText("Stop playback"));

      expect(updateController).toHaveBeenCalledOnce();
      expect(updateController).toHaveBeenCalledWith({
        playing: false,
        currentAsset: null,
        activeQueueId: null,
      });
    });

    it("is always enabled", () => {
      const queue = makeQueue({ items: [] });
      setupMock({
        activeQueueId: "queue-1",
        queues: { "queue-1": queue },
        currentAsset: { asset: { key: "img0", type: "IMAGE" }, time: null },
      });

      render(<PlaybackBar />);

      expect(screen.getByLabelText("Stop playback")).not.toBeDisabled();
    });
  });
});
