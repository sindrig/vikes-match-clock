import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import useGlobalShortcuts from "./useGlobalShortcuts";
import { VIEWS, ASSET_VIEWS } from "../constants";

// Mock the Firebase context hooks
vi.mock("../contexts/FirebaseStateContext", () => ({
  useMatch: vi.fn(),
  useController: vi.fn(),
}));

vi.mock("../contexts/LocalStateContext", () => ({
  useLocalState: vi.fn(),
}));

import { useMatch, useController } from "../contexts/FirebaseStateContext";
import { useLocalState } from "../contexts/LocalStateContext";

// Type definitions for mocks
const mockedUseMatch = vi.mocked(useMatch);
const mockedUseController = vi.mocked(useController);
const mockedUseLocalState = vi.mocked(useLocalState);

interface TestComponentProps {
  onKeyDown?: (event: KeyboardEvent) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}

// Component that uses the hook and optionally renders an input
const TestComponent = ({ onKeyDown, inputRef }: TestComponentProps) => {
  useGlobalShortcuts();

  React.useEffect(() => {
    if (onKeyDown) {
      const handler = onKeyDown;
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }
  }, [onKeyDown]);

  return <input ref={inputRef} data-testid="input" />;
};

describe("useGlobalShortcuts", () => {
  let mockStartMatch: ReturnType<typeof vi.fn>;
  let mockPauseMatch: ReturnType<typeof vi.fn>;
  let mockAddGoal: ReturnType<typeof vi.fn>;
  let mockShowNextAsset: ReturnType<typeof vi.fn>;
  let mockRenderAsset: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    mockStartMatch = vi.fn();
    mockPauseMatch = vi.fn();
    mockAddGoal = vi.fn();
    mockShowNextAsset = vi.fn();
    mockRenderAsset = vi.fn();

    mockedUseMatch.mockReturnValue({
      match: { started: 0 },
      startMatch: mockStartMatch,
      pauseMatch: mockPauseMatch,
      addGoal: mockAddGoal,
    } as unknown as ReturnType<typeof useMatch>);

    mockedUseController.mockReturnValue({
      controller: {
        view: VIEWS.control,
        assetView: ASSET_VIEWS.assets,
        selectedAssets: [],
        currentAsset: null,
      },
      showNextAsset: mockShowNextAsset,
      renderAsset: mockRenderAsset,
    } as unknown as ReturnType<typeof useController>);

    mockedUseLocalState.mockReturnValue({
      auth: { isEmpty: false, isLoaded: true },
      sync: false,
    } as unknown as ReturnType<typeof useLocalState>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Control View Shortcuts", () => {
    describe("Space key", () => {
      it("calls startMatch when Space pressed in control view and match not started", () => {
        render(<TestComponent />);

        fireEvent.keyDown(window, { code: "Space" });

        expect(mockStartMatch).toHaveBeenCalledTimes(1);
        expect(mockPauseMatch).not.toHaveBeenCalled();
       });

        it("calls pauseMatch when Space pressed in control view and match already started", () => {
          mockedUseMatch.mockReturnValue({
            match: { started: 1704067200 }, // Non-zero timestamp
            startMatch: mockStartMatch,
            pauseMatch: mockPauseMatch,
            addGoal: mockAddGoal,
          } as unknown as ReturnType<typeof useMatch>);

        render(<TestComponent />);

        fireEvent.keyDown(window, { code: "Space" });

        expect(mockPauseMatch).toHaveBeenCalledTimes(1);
        expect(mockStartMatch).not.toHaveBeenCalled();
       });

         it("does not call any action when Space pressed outside control view", () => {
           mockedUseController.mockReturnValue({
             controller: {
               view: VIEWS.match,
               assetView: ASSET_VIEWS.assets,
               selectedAssets: [],
               currentAsset: null,
             },
             showNextAsset: mockShowNextAsset,
            renderAsset: mockRenderAsset,
          } as unknown as ReturnType<typeof useController>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "Space" });

         expect(mockStartMatch).not.toHaveBeenCalled();
         expect(mockPauseMatch).not.toHaveBeenCalled();
       });
    });

    describe("ArrowUp key", () => {
      it("calls addGoal('home') when ArrowUp pressed in control view", () => {
        render(<TestComponent />);

        fireEvent.keyDown(window, { code: "ArrowUp" });

        expect(mockAddGoal).toHaveBeenCalledTimes(1);
        expect(mockAddGoal).toHaveBeenCalledWith("home");
      });

         it("does not call addGoal when ArrowUp pressed outside control view", () => {
           mockedUseController.mockReturnValue({
             controller: {
               view: VIEWS.match,
               assetView: ASSET_VIEWS.assets,
               selectedAssets: [],
               currentAsset: null,
            },
            showNextAsset: mockShowNextAsset,
            renderAsset: mockRenderAsset,
          } as unknown as ReturnType<typeof useController>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "ArrowUp" });

         expect(mockAddGoal).not.toHaveBeenCalled();
       });
    });

    describe("ArrowDown key", () => {
      it("calls addGoal('away') when ArrowDown pressed in control view", () => {
        render(<TestComponent />);

        fireEvent.keyDown(window, { code: "ArrowDown" });

        expect(mockAddGoal).toHaveBeenCalledTimes(1);
        expect(mockAddGoal).toHaveBeenCalledWith("away");
      });

        it("does not call addGoal when ArrowDown pressed outside control view", () => {
          mockedUseController.mockReturnValue({
            controller: {
              view: VIEWS.match,
              assetView: ASSET_VIEWS.assets,
              selectedAssets: [],
              currentAsset: null,
            },
            showNextAsset: mockShowNextAsset,
            renderAsset: mockRenderAsset,
          } as unknown as ReturnType<typeof useController>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "ArrowDown" });

         expect(mockAddGoal).not.toHaveBeenCalled();
       });
    });
  });

  describe("Asset View Shortcuts", () => {
    describe("Space key in asset view with selectedAssets", () => {
        it("calls showNextAsset when Space pressed with selectedAssets in asset view (match view)", () => {
          mockedUseController.mockReturnValue({
            controller: {
              view: VIEWS.match,
              assetView: ASSET_VIEWS.assets,
              selectedAssets: ["asset-1"],
              currentAsset: null,
            },
            showNextAsset: mockShowNextAsset,
            renderAsset: mockRenderAsset,
          } as unknown as ReturnType<typeof useController>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "Space" });

         expect(mockShowNextAsset).toHaveBeenCalledTimes(1);
         expect(mockRenderAsset).not.toHaveBeenCalled();
       });

        it("calls showNextAsset when Space pressed with selectedAssets in asset view (idle view)", () => {
          mockedUseController.mockReturnValue({
            controller: {
              view: VIEWS.idle,
              assetView: ASSET_VIEWS.assets,
              selectedAssets: ["asset-2"],
              currentAsset: null,
            },
            showNextAsset: mockShowNextAsset,
            renderAsset: mockRenderAsset,
          } as unknown as ReturnType<typeof useController>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "Space" });

         expect(mockShowNextAsset).toHaveBeenCalledTimes(1);
         expect(mockRenderAsset).not.toHaveBeenCalled();
       });

        it("does not call showNextAsset when Space pressed with empty selectedAssets and no currentAsset", () => {
          mockedUseController.mockReturnValue({
            controller: {
              view: VIEWS.match,
              assetView: ASSET_VIEWS.assets,
              selectedAssets: [],
              currentAsset: null,
            },
            showNextAsset: mockShowNextAsset,
            renderAsset: mockRenderAsset,
          } as unknown as ReturnType<typeof useController>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "Space" });

         expect(mockShowNextAsset).not.toHaveBeenCalled();
         expect(mockRenderAsset).not.toHaveBeenCalled();
       });
    });

    describe("Space key in asset view with currentAsset", () => {
        it("calls renderAsset(null) when Space pressed with currentAsset and no selectedAssets", () => {
          mockedUseController.mockReturnValue({
            controller: {
              view: VIEWS.match,
              assetView: ASSET_VIEWS.assets,
              selectedAssets: [],
              currentAsset: { key: "asset-1", type: "image" },
            },
            showNextAsset: mockShowNextAsset,
            renderAsset: mockRenderAsset,
          } as unknown as ReturnType<typeof useController>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "Space" });

         expect(mockRenderAsset).toHaveBeenCalledTimes(1);
         expect(mockRenderAsset).toHaveBeenCalledWith(null);
         expect(mockShowNextAsset).not.toHaveBeenCalled();
       });

        it("calls renderAsset(null) in idle view with currentAsset and no selectedAssets", () => {
          mockedUseController.mockReturnValue({
            controller: {
              view: VIEWS.idle,
              assetView: ASSET_VIEWS.assets,
              selectedAssets: [],
              currentAsset: { key: "asset-1", type: "video" },
            },
            showNextAsset: mockShowNextAsset,
            renderAsset: mockRenderAsset,
          } as unknown as ReturnType<typeof useController>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "Space" });

         expect(mockRenderAsset).toHaveBeenCalledTimes(1);
         expect(mockRenderAsset).toHaveBeenCalledWith(null);
       });

        it("prioritizes showNextAsset over renderAsset when both selectedAssets and currentAsset exist", () => {
          mockedUseController.mockReturnValue({
            controller: {
              view: VIEWS.match,
              assetView: ASSET_VIEWS.assets,
              selectedAssets: ["asset-1"],
              currentAsset: { key: "asset-2", type: "image" },
            },
            showNextAsset: mockShowNextAsset,
            renderAsset: mockRenderAsset,
          } as unknown as ReturnType<typeof useController>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "Space" });

         expect(mockShowNextAsset).toHaveBeenCalledTimes(1);
         expect(mockRenderAsset).not.toHaveBeenCalled();
       });

        it("does not trigger asset shortcuts in control view with currentAsset", () => {
          mockedUseController.mockReturnValue({
            controller: {
              view: VIEWS.control,
              assetView: ASSET_VIEWS.assets,
              selectedAssets: [],
              currentAsset: { key: "asset-1", type: "image" },
            },
            showNextAsset: mockShowNextAsset,
            renderAsset: mockRenderAsset,
          } as unknown as ReturnType<typeof useController>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "Space" });

         expect(mockRenderAsset).not.toHaveBeenCalled();
         expect(mockShowNextAsset).not.toHaveBeenCalled();
       });
    });

    describe("Space key in non-asset views", () => {
        it("does not trigger asset shortcuts when assetView is not 'assets'", () => {
          mockedUseController.mockReturnValue({
            controller: {
              view: VIEWS.match,
              assetView: "teams",
              selectedAssets: ["asset-1"],
              currentAsset: null,
            },
            showNextAsset: mockShowNextAsset,
            renderAsset: mockRenderAsset,
          } as unknown as ReturnType<typeof useController>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "Space" });

         expect(mockShowNextAsset).not.toHaveBeenCalled();
         expect(mockRenderAsset).not.toHaveBeenCalled();
       });
    });
  });

  describe("Blocking Conditions", () => {
    describe("Input/Textarea focus blocking", () => {
      it("does not call any action when typing in an input element", () => {
        const inputRef = React.createRef<HTMLInputElement>();
        render(<TestComponent inputRef={inputRef} />);

        // Focus the input and simulate keypress
        if (inputRef.current) {
          inputRef.current.focus();
          fireEvent.keyDown(inputRef.current, { code: "Space" });
        }

        expect(mockStartMatch).not.toHaveBeenCalled();
        expect(mockPauseMatch).not.toHaveBeenCalled();
      });

      it("does not call any action when typing in a textarea element", () => {
        const { container } = render(
          <div>
            <textarea data-testid="textarea" />
            <TestComponent />
          </div>,
        );

        const textarea = container.querySelector(
          "textarea",
        ) as HTMLTextAreaElement;
        textarea.focus();
        fireEvent.keyDown(textarea, { code: "Space" });

        expect(mockStartMatch).not.toHaveBeenCalled();
        expect(mockPauseMatch).not.toHaveBeenCalled();
      });

      it("calls action when input is blurred", () => {
        const inputRef = React.createRef<HTMLInputElement>();
        render(<TestComponent inputRef={inputRef} />);

        // Focus the input, blur it, then press Space
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.blur();
          fireEvent.keyDown(window, { code: "Space" });
        }

        expect(mockStartMatch).toHaveBeenCalledTimes(1);
      });
    });

    describe("Auth/Sync blocking", () => {
        it("blocks shortcuts when sync=true AND auth.isEmpty=true", () => {
          mockedUseLocalState.mockReturnValue({
            auth: { isEmpty: true, isLoaded: true },
            sync: true,
          } as unknown as ReturnType<typeof useLocalState>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "Space" });

         expect(mockStartMatch).not.toHaveBeenCalled();
         expect(mockPauseMatch).not.toHaveBeenCalled();
       });

        it("allows shortcuts when sync=false", () => {
          mockedUseLocalState.mockReturnValue({
            auth: { isEmpty: true, isLoaded: true },
            sync: false,
          } as unknown as ReturnType<typeof useLocalState>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "Space" });

         expect(mockStartMatch).toHaveBeenCalledTimes(1);
       });

        it("allows shortcuts when auth.isEmpty=false", () => {
          mockedUseLocalState.mockReturnValue({
            auth: { isEmpty: false, isLoaded: true },
            sync: true,
          } as unknown as ReturnType<typeof useLocalState>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "Space" });

         expect(mockStartMatch).toHaveBeenCalledTimes(1);
       });

        it("allows shortcuts when sync=true AND auth.isEmpty=false", () => {
          mockedUseLocalState.mockReturnValue({
            auth: { isEmpty: false, isLoaded: true },
            sync: true,
          } as unknown as ReturnType<typeof useLocalState>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "ArrowUp" });

         expect(mockAddGoal).toHaveBeenCalledWith("home");
       });

        it("blocks all shortcuts when sync=true AND auth.isEmpty=true (ArrowUp)", () => {
          mockedUseLocalState.mockReturnValue({
            auth: { isEmpty: true, isLoaded: true },
            sync: true,
          } as unknown as ReturnType<typeof useLocalState>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "ArrowUp" });

         expect(mockAddGoal).not.toHaveBeenCalled();
       });

        it("blocks all shortcuts when sync=true AND auth.isEmpty=true (ArrowDown)", () => {
          mockedUseLocalState.mockReturnValue({
            auth: { isEmpty: true, isLoaded: true },
            sync: true,
          } as unknown as ReturnType<typeof useLocalState>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "ArrowDown" });

         expect(mockAddGoal).not.toHaveBeenCalled();
       });

        it("blocks asset view shortcuts when sync=true AND auth.isEmpty=true", () => {
          mockedUseLocalState.mockReturnValue({
            auth: { isEmpty: true, isLoaded: true },
            sync: true,
          } as unknown as ReturnType<typeof useLocalState>);

          mockedUseController.mockReturnValue({
            controller: {
              view: VIEWS.match,
              assetView: ASSET_VIEWS.assets,
              selectedAssets: ["asset-1"],
              currentAsset: null,
            },
            showNextAsset: mockShowNextAsset,
            renderAsset: mockRenderAsset,
          } as unknown as ReturnType<typeof useController>);

         render(<TestComponent />);

         fireEvent.keyDown(window, { code: "Space" });

         expect(mockShowNextAsset).not.toHaveBeenCalled();
         expect(mockRenderAsset).not.toHaveBeenCalled();
       });
    });
  });

  describe("Event preventDefault", () => {
    it("prevents default for Space key in control view", () => {
      render(<TestComponent />);

      const keydownEvent = new KeyboardEvent("keydown", { code: "Space" });
      const preventDefaultSpy = vi.spyOn(keydownEvent, "preventDefault");
      window.dispatchEvent(keydownEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("prevents default for ArrowUp key in control view", () => {
      render(<TestComponent />);

      const keydownEvent = new KeyboardEvent("keydown", { code: "ArrowUp" });
      const preventDefaultSpy = vi.spyOn(keydownEvent, "preventDefault");
      window.dispatchEvent(keydownEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

        it("prevents default for Space key in asset view with selectedAssets", () => {
          mockedUseController.mockReturnValue({
            controller: {
              view: VIEWS.match,
              assetView: ASSET_VIEWS.assets,
              selectedAssets: ["asset-1"],
              currentAsset: null,
            },
            showNextAsset: mockShowNextAsset,
            renderAsset: mockRenderAsset,
          } as unknown as ReturnType<typeof useController>);

       render(<TestComponent />);

       const keydownEvent = new KeyboardEvent("keydown", { code: "Space" });
       const preventDefaultSpy = vi.spyOn(keydownEvent, "preventDefault");
       window.dispatchEvent(keydownEvent);

       expect(preventDefaultSpy).toHaveBeenCalled();
     });
  });

  describe("Multiple key presses", () => {
    it("handles rapid key presses correctly", () => {
      render(<TestComponent />);

      fireEvent.keyDown(window, { code: "Space" });
      fireEvent.keyDown(window, { code: "ArrowUp" });
      fireEvent.keyDown(window, { code: "ArrowDown" });

      expect(mockStartMatch).toHaveBeenCalledTimes(1);
      expect(mockAddGoal).toHaveBeenCalledTimes(2);
      expect(mockAddGoal).toHaveBeenNthCalledWith(1, "home");
      expect(mockAddGoal).toHaveBeenNthCalledWith(2, "away");
    });
  });
});
