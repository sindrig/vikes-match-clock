import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import QueuePicker from "./QueuePicker";
import type { Asset } from "../../../types";

const assets: Asset[] = [
  { type: "IMAGE", key: "image", url: "https://example.test/image.png" },
];

function deferred() {
  let resolve!: () => void;
  let reject!: (failure: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const queues = {
  queue: {
    id: "queue",
    name: "Existing",
    items: [],
    cycle: true,
    autoPlay: false,
    imageSeconds: 3,
    order: 0,
  },
};

describe("QueuePicker submission feedback", () => {
  it("retains the empty-board draft after denied auto-creation and allows an explicit retry", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error("Save denied"))
      .mockResolvedValue(undefined);
    const close = vi.fn();
    render(
      <QueuePicker
        draftId="retry"
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
        draftId="rapid"
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

  it.each(["Sýna", "Existing", "Ný biðröð"])(
    "lets a newer draft submit %s while the older acknowledgement is held",
    async (action) => {
      const older = deferred();
      const newer = deferred();
      const create = vi.fn().mockReturnValue(older.promise);
      const save = vi.fn().mockReturnValue(newer.promise);
      const props = {
        queues,
        assets,
        onCreateAndAdd: create,
        onShowNow: save,
        onAddToQueue: save,
        onClose: vi.fn(),
      };
      const { rerender } = render(<QueuePicker {...props} draftId="older" />);
      fireEvent.click(screen.getByRole("button", { name: "Ný biðröð" }));
      // Even identical assets are a new selection, including an A -> B -> A.
      rerender(
        <QueuePicker {...props} draftId="newer" onCreateAndAdd={save} />,
      );
      expect(screen.getByRole("button", { name: "Sýna" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Existing" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: action }));
      expect(save).toHaveBeenCalledTimes(1);
      await act(async () => {
        older.reject(new Error("Older denied"));
        await older.promise.catch(() => undefined);
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sýna" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: action }));
      expect(save).toHaveBeenCalledTimes(1);
      await act(async () => {
        newer.reject(new Error("Newer denied"));
        await newer.promise.catch(() => undefined);
      });
      expect(screen.getByRole("alert")).toHaveTextContent("Newer denied");
      save.mockResolvedValue(undefined);
      fireEvent.click(screen.getByRole("button", { name: action }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
      );
    },
  );

  it.each(["success", "failure"])(
    "does not let an older %s erase a newer error after an assets ABA",
    async (outcome) => {
      const older = deferred();
      const create = vi
        .fn()
        .mockReturnValueOnce(older.promise)
        .mockRejectedValue(new Error("Current draft denied"));
      const props = {
        queues,
        assets,
        onCreateAndAdd: create,
        onShowNow: vi.fn(),
        onAddToQueue: vi.fn(),
        onClose: vi.fn(),
      };
      const { rerender } = render(<QueuePicker {...props} draftId="a1" />);
      fireEvent.click(screen.getByRole("button", { name: "Ný biðröð" }));
      rerender(
        <QueuePicker
          {...props}
          draftId="b"
          assets={[{ type: "URL", key: "b" }]}
        />,
      );
      rerender(<QueuePicker {...props} draftId="a2" />);
      fireEvent.click(screen.getByRole("button", { name: "Ný biðröð" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Current draft denied",
      );
      await act(async () => {
        if (outcome === "success") older.resolve();
        else older.reject(new Error("Obsolete failure"));
        await older.promise.catch(() => undefined);
      });
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Current draft denied",
      );
      expect(create).toHaveBeenCalledTimes(2);
    },
  );

  it("auto-creates each empty-board draft once, without sharing pending state", async () => {
    const older = deferred();
    const newer = deferred();
    const create = vi
      .fn()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const props = {
      queues: {},
      assets,
      onCreateAndAdd: create,
      onShowNow: vi.fn(),
      onAddToQueue: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender } = render(<QueuePicker {...props} draftId="a" />);
    rerender(<QueuePicker {...props} draftId="b" />);
    expect(create).toHaveBeenCalledTimes(2);
    await act(async () => {
      newer.reject(new Error("B denied"));
      await newer.promise.catch(() => undefined);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("B denied");
    await act(async () => {
      older.reject(new Error("A denied"));
      await older.promise.catch(() => undefined);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("B denied");
    rerender(<QueuePicker {...props} draftId="b" />);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
