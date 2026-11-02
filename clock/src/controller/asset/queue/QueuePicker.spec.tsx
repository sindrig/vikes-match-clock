import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import QueuePicker from "./QueuePicker";
import type { Asset } from "../../../types";

const assets: Asset[] = [
  { type: "IMAGE", key: "image", url: "https://example.test/image.png" },
];

describe("QueuePicker submission feedback", () => {
  it("retains the empty-board draft after denied auto-creation and allows an explicit retry", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error("Save denied"))
      .mockResolvedValue(undefined);
    const close = vi.fn();
    render(
      <QueuePicker
        queues={{}}
        assets={assets}
        onCreateAndAdd={create}
        onAddToQueue={vi.fn()}
        onShowNow={vi.fn()}
        onClose={close}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Save denied");
    expect(create).toHaveBeenCalledExactlyOnceWith("Biðröð 1", assets);
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ný biðröð" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
  });

  it("makes a single submission for rapid clicks while the create is pending", () => {
    const create = vi.fn().mockReturnValue(new Promise(() => undefined));
    render(
      <QueuePicker
        queues={{
          queue: {
            id: "queue",
            name: "Existing",
            items: [],
            cycle: true,
            autoPlay: false,
            imageSeconds: 3,
            order: 0,
          },
        }}
        assets={assets}
        onCreateAndAdd={create}
        onAddToQueue={vi.fn()}
        onShowNow={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: "Ný biðröð" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(create).toHaveBeenCalledExactlyOnceWith("Biðröð 2", assets);
  });
});
