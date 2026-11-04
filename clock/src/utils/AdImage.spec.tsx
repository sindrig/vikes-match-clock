import { act, cleanup, render, screen } from "@testing-library/react";
import { getStorage, ref } from "firebase/storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { storageHelpers, type ListResult } from "../firebase";
import AdImage from "./AdImage";

let venue = "A";
vi.mock("../contexts/LocalStateContext", () => ({
  useLocalState: () => ({ listenPrefix: venue }),
}));
vi.mock("../firebase", () => ({
  storageHelpers: { listAll: vi.fn(), getDownloadURL: vi.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}
async function settle(action: () => void) {
  await act(async () => {
    action();
    await Promise.resolve();
  });
}
function listing(): ListResult {
  return { items: [ref(getStorage(), "ad.png")], prefixes: [] };
}
beforeEach(() => {
  venue = "A";
  vi.mocked(storageHelpers.listAll).mockReset().mockResolvedValue(listing());
  vi.mocked(storageHelpers.getDownloadURL)
    .mockReset()
    .mockResolvedValue("https://example.test/current.png");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("optional scoreboard ads", () => {
  it("keeps authorized listing, URL resolution and rotation", async () => {
    vi.useFakeTimers();
    const first = listing();
    vi.mocked(storageHelpers.listAll).mockResolvedValue({
      ...first,
      items: [...first.items, ...first.items],
    });
    vi.mocked(storageHelpers.getDownloadURL)
      .mockResolvedValueOnce("https://example.test/first.png")
      .mockResolvedValueOnce("https://example.test/second.png");
    await settle(() => {
      render(<AdImage imageType="smallAds" />);
    });
    expect(storageHelpers.listAll).toHaveBeenCalledWith("A/smallAds");
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.test/first.png",
    );
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.test/second.png",
    );
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.test/first.png",
    );
  });

  it.each(["storage/unauthorized", "storage/retry-limit-exceeded"])(
    "leaves the optional slot empty after listing fails with %s",
    async (code) => {
      vi.mocked(storageHelpers.listAll).mockRejectedValue(
        Object.assign(new Error(code), { code }),
      );
      await settle(() => {
        render(<AdImage imageType="smallAds" />);
      });
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(storageHelpers.getDownloadURL).not.toHaveBeenCalled();
    },
  );

  it("handles a failed download URL without an unhandled rejection", async () => {
    vi.mocked(storageHelpers.getDownloadURL).mockRejectedValue(
      new Error("download unavailable"),
    );
    await settle(() => {
      render(<AdImage imageType="smallAds" />);
    });
    expect(storageHelpers.getDownloadURL).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("retires an old listing on imageType change before requesting its URLs", async () => {
    const old = deferred<ListResult>();
    vi.mocked(storageHelpers.listAll).mockReturnValueOnce(old.promise);
    const view = render(<AdImage imageType="smallAds" />);
    await settle(() => view.rerender(<AdImage imageType="ads" />));
    await settle(() => old.resolve(listing()));
    expect(storageHelpers.listAll).toHaveBeenLastCalledWith("A/ads");
    expect(storageHelpers.getDownloadURL).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.test/current.png",
    );
  });

  it("masks loaded ads while a new venue listing is pending", async () => {
    const current = deferred<ListResult>();
    const view = render(<AdImage imageType="smallAds" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("img")).toBeInTheDocument();
    venue = "B";
    vi.mocked(storageHelpers.listAll).mockReturnValueOnce(current.promise);
    view.rerender(<AdImage imageType="smallAds" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    await settle(() => current.resolve({ items: [], prefixes: [] }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("ignores an old URL success after a venue change", async () => {
    const old = deferred<string>();
    const current = deferred<ListResult>();
    vi.mocked(storageHelpers.getDownloadURL).mockReturnValueOnce(old.promise);
    const view = render(<AdImage imageType="smallAds" />);
    await act(async () => {
      await Promise.resolve();
    });
    venue = "B";
    vi.mocked(storageHelpers.listAll).mockReturnValueOnce(current.promise);
    view.rerender(<AdImage imageType="smallAds" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    await settle(() => current.resolve(listing()));
    await settle(() => old.resolve("https://example.test/old.png"));
    expect(storageHelpers.listAll).toHaveBeenLastCalledWith("B/smallAds");
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.test/current.png",
    );
  });

  it("does not let a late old URL failure clear a replacement imageType", async () => {
    const old = deferred<string>();
    vi.mocked(storageHelpers.getDownloadURL).mockReturnValueOnce(old.promise);
    const view = render(<AdImage imageType="smallAds" />);
    await act(async () => {
      await Promise.resolve();
    });
    await settle(() => view.rerender(<AdImage imageType="ads" />));
    await settle(() => old.reject(new Error("old URL failed")));
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.test/current.png",
    );
  });

  it("does not request URLs from a listing completed after unmount", async () => {
    const old = deferred<ListResult>();
    vi.mocked(storageHelpers.listAll).mockReturnValueOnce(old.promise);
    const view = render(<AdImage imageType="smallAds" />);
    view.unmount();
    await settle(() => old.resolve(listing()));
    expect(storageHelpers.getDownloadURL).not.toHaveBeenCalled();
  });
});
