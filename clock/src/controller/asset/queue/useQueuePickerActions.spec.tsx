import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useController } from "../../../contexts/FirebaseStateContext";
import type { Asset } from "../../../types";
import { useQueuePickerActions } from "./useQueuePickerActions";

vi.mock("../../../contexts/FirebaseStateContext", () => ({
  useController: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (failure: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const asset: Asset = { type: "URL", key: "a" };
const createQueue = vi.fn();
const addItemsToQueue = vi.fn();
const renderAsset = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  createQueue.mockResolvedValue("created");
  vi.mocked(useController).mockReturnValue({
    createQueue,
    addItemsToQueue,
    renderAsset,
  } as unknown as ReturnType<typeof useController>);
});

describe("picker draft ownership", () => {
  it("keeps the first ready draft usable while a newer selection is still preparing", async () => {
    const first = deferred<Asset>();
    const second = deferred<Asset>();
    const acknowledgement = deferred<string>();
    createQueue.mockReturnValueOnce(acknowledgement.promise);
    const { result } = renderHook(useQueuePickerActions);
    act(() => {
      result.current.selectAssets([first.promise]);
      result.current.selectAssets([second.promise]);
    });
    await act(async () => {
      first.resolve(asset);
      await first.promise;
    });
    const a = result.current.pending!;
    expect(a.assets).toEqual([asset]);
    const save = a.onCreateAndAdd("A", a.assets);
    await act(async () => {
      second.resolve({ type: "URL", key: "b" });
      await second.promise;
    });
    const b = result.current.pending;
    expect(b?.assets).toEqual([{ type: "URL", key: "b" }]);
    await act(async () => {
      acknowledgement.resolve("a-saved");
      await save;
    });
    expect(result.current.pending).toBe(b);
    expect(createQueue).toHaveBeenCalledExactlyOnceWith("A", [asset]);
  });

  it("gives identical-assets ABA drafts separate lifetimes and guards an older save's close", async () => {
    const acknowledgement = deferred<string>();
    createQueue.mockReturnValueOnce(acknowledgement.promise);
    const { result } = renderHook(useQueuePickerActions);
    act(() => result.current.selectAssets([asset]));
    await waitFor(() => expect(result.current.pending).not.toBeNull());
    const a1 = result.current.pending!;
    const save = a1.onCreateAndAdd("A", a1.assets);
    act(() => result.current.selectAssets([{ type: "URL", key: "b" }]));
    await waitFor(() => expect(result.current.pending).not.toBe(a1));
    const b = result.current.pending!;
    act(() => result.current.selectAssets([asset]));
    await waitFor(() => expect(result.current.pending).not.toBe(b));
    const a2 = result.current.pending!;
    expect(new Set([a1.draftId, b.draftId, a2.draftId]).size).toBe(3);
    await act(async () => {
      acknowledgement.resolve("old");
      await save;
    });
    expect(result.current.pending).toBe(a2);
    expect(a2.assets).toEqual([asset]);
    await act(async () => {
      await a2.onCreateAndAdd("A retry", a2.assets);
    });
    expect(result.current.pending).toBeNull();
    expect(createQueue).toHaveBeenLastCalledWith("A retry", [asset]);
  });

  it.each(["success", "failure"])(
    "retires an older preparation's %s when a newer draft is ready",
    async (outcome) => {
      const media = deferred<Asset>();
      const { result } = renderHook(useQueuePickerActions);
      act(() => result.current.selectAssets([media.promise]));
      act(() => result.current.selectAssets([asset]));
      await waitFor(() => expect(result.current.pending).not.toBeNull());
      const current = result.current.pending;
      await act(async () => {
        if (outcome === "success")
          media.resolve({ type: "URL", key: "obsolete" });
        else media.reject(new Error("Obsolete media failure"));
        await media.promise.catch(() => undefined);
      });
      expect(result.current.pending).toBe(current);
      expect(result.current.error).toBe("");
    },
  );

  it("does not replace a newer preparation error with an older show-now rejection", async () => {
    const acknowledgement = deferred<void>();
    renderAsset.mockReturnValue(acknowledgement.promise);
    const { result } = renderHook(useQueuePickerActions);
    act(() => result.current.selectAssets([asset], { showNow: true }));
    await waitFor(() => expect(renderAsset).toHaveBeenCalledWith(asset));
    act(() =>
      result.current.selectAssets([
        Promise.reject(new Error("Current media failure")),
      ]),
    );
    await waitFor(() =>
      expect(result.current.error).toBe("Current media failure"),
    );
    await act(async () => {
      acknowledgement.reject(new Error("Old write denied"));
      await acknowledgement.promise.catch(() => undefined);
    });
    expect(result.current.error).toBe("Current media failure");
    act(() => result.current.selectAssets([asset]));
    await waitFor(() => expect(result.current.pending).not.toBeNull());
    expect(result.current.error).toBe("");
    expect(result.current.pending?.assets).toEqual([asset]);
  });

  it("retires media preparation on unmount before any show-now submission", async () => {
    const media = deferred<Asset>();
    const { result, unmount } = renderHook(useQueuePickerActions);
    act(() => result.current.selectAssets([media.promise], { showNow: true }));
    unmount();
    await act(async () => {
      media.resolve(asset);
      await media.promise;
    });
    expect(renderAsset).not.toHaveBeenCalled();
    expect(createQueue).not.toHaveBeenCalled();
  });
});
