import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import SubstitutionInfo from "./SubstitutionInfo";
import { useController } from "../../../contexts/FirebaseStateContext";
import { ControllerState } from "../../../types";

vi.mock("../../../contexts/FirebaseStateContext", () => ({
  useController: vi.fn(),
}));

const mockedUseController = vi.mocked(useController);

function setupMock(overrides?: Partial<ControllerState>) {
  mockedUseController.mockReturnValue({
    controller: {
      queues: {},
      activeQueueId: null,
      playing: false,
      assetView: "assets",
      view: "idle",
      roster: { home: [], away: [] },
      currentAsset: null,
      refreshToken: "",
      ...overrides,
    },
  } as unknown as ReturnType<typeof useController>);
}

describe("SubstitutionInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when no current asset", () => {
    setupMock({ currentAsset: null });
    const { container } = render(<SubstitutionInfo />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when current asset is not a substitution", () => {
    setupMock({
      currentAsset: { asset: { key: "img1", type: "IMAGE" }, time: null },
    });
    const { container } = render(<SubstitutionInfo />);
    expect(container.innerHTML).toBe("");
  });

  it("renders player full names and team for substitution asset", () => {
    setupMock({
      currentAsset: {
        asset: {
          key: "sub-1",
          type: "IMAGE",
          subIn: {
            key: "in-1",
            type: "IMAGE",
            name: "Jón",
            fullName: "Jón Jónsson",
            number: 7,
            teamName: "Víkingur R",
          },
          subOut: {
            key: "out-1",
            type: "IMAGE",
            name: "Guðmundur",
            fullName: "Guðmundur Pétursson",
            number: 11,
            teamName: "Víkingur R",
          },
        },
        time: null,
      },
    });

    render(<SubstitutionInfo />);

    expect(screen.getByTestId("substitution-info")).toBeInTheDocument();
    expect(screen.getByText("Víkingur R")).toBeInTheDocument();
    expect(screen.getByText("Af velli: #7 - Jón Jónsson")).toBeInTheDocument();
    expect(
      screen.getByText("Inn á: #11 - Guðmundur Pétursson"),
    ).toBeInTheDocument();
  });

  it("falls back to name when fullName is not set", () => {
    setupMock({
      currentAsset: {
        asset: {
          key: "sub-2",
          type: "IMAGE",
          subIn: { key: "in-2", type: "IMAGE", name: "Leaving Player" },
          subOut: { key: "out-2", type: "IMAGE", name: "Entering Player" },
        },
        time: null,
      },
    });

    render(<SubstitutionInfo />);

    expect(screen.getByText("Af velli: Leaving Player")).toBeInTheDocument();
    expect(screen.getByText("Inn á: Entering Player")).toBeInTheDocument();
  });
});
