import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MediaManager from "./MediaManager";

vi.mock("../../contexts/LocalStateContext", () => ({
  useLocalState: () => ({ auth: { isEmpty: false }, listenPrefix: "venue" }),
}));

vi.mock("../../contexts/FirebaseStateContext", () => ({
  useController: () => ({
    controller: { queues: {} },
    createQueue: vi.fn(),
    addItemsToQueue: vi.fn(),
    showItemNow: vi.fn(),
  }),
}));

vi.mock("./UploadManager", () => ({
  default: ({ allowVideo }: { allowVideo: boolean }) => (
    <div data-testid="upload-manager" data-allow-video={allowVideo} />
  ),
}));
vi.mock("./ImageList", () => ({ default: () => null }));
vi.mock("./PerimeterMediaPairs", () => ({ default: () => null }));

describe("MediaManager", () => {
  it("enables MP4 uploads in Myndir but keeps image-only ad and player tabs unchanged", () => {
    render(<MediaManager />);
    expect(screen.getByTestId("upload-manager")).toHaveAttribute(
      "data-allow-video",
      "true",
    );

    for (const tab of ["Augl (stórar)", "Augl (litlar)", "Leikmenn"]) {
      fireEvent.click(screen.getByText(tab));
      expect(screen.getByTestId("upload-manager")).toHaveAttribute(
        "data-allow-video",
        "false",
      );
    }

    fireEvent.click(screen.getByText("Myndir"));
    expect(screen.getByTestId("upload-manager")).toHaveAttribute(
      "data-allow-video",
      "true",
    );
  });
});
