import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import GlobalShortcut from "./GlobalShortcut";

describe("GlobalShortcut", () => {
  let onTrigger: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onTrigger = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing (returns null)", () => {
    const { container } = render(
      <GlobalShortcut shortcut="a" onTrigger={onTrigger} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("triggers callback on simple key press", () => {
    render(<GlobalShortcut shortcut="a" onTrigger={onTrigger} />);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("triggers callback case-insensitively", () => {
    render(<GlobalShortcut shortcut="a" onTrigger={onTrigger} />);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "A" }));

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("does not trigger on wrong key", () => {
    render(<GlobalShortcut shortcut="a" onTrigger={onTrigger} />);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("triggers on Control+key combo", () => {
    render(<GlobalShortcut shortcut="Control+k" onTrigger={onTrigger} />);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
    );

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("does not trigger Control+key without ctrl pressed", () => {
    render(<GlobalShortcut shortcut="Control+k" onTrigger={onTrigger} />);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: false }),
    );

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("triggers on Alt+key combo", () => {
    render(<GlobalShortcut shortcut="Alt+x" onTrigger={onTrigger} />);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "x", altKey: true }),
    );

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("triggers on Shift+key combo", () => {
    render(<GlobalShortcut shortcut="Shift+s" onTrigger={onTrigger} />);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", shiftKey: true }),
    );

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("triggers on Control+Alt+key combo", () => {
    render(<GlobalShortcut shortcut="Control+Alt+p" onTrigger={onTrigger} />);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "p", ctrlKey: true, altKey: true }),
    );

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("does not trigger Control+Alt+key with only ctrl pressed", () => {
    render(<GlobalShortcut shortcut="Control+Alt+p" onTrigger={onTrigger} />);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "p", ctrlKey: true, altKey: false }),
    );

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("calls preventDefault when option is set", () => {
    render(
      <GlobalShortcut shortcut="a" onTrigger={onTrigger} preventDefault />,
    );

    const event = new KeyboardEvent("keydown", { key: "a" });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    window.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it("does not call preventDefault by default", () => {
    render(<GlobalShortcut shortcut="a" onTrigger={onTrigger} />);

    const event = new KeyboardEvent("keydown", { key: "a" });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    window.dispatchEvent(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it("cleans up event listener on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(
      <GlobalShortcut shortcut="a" onTrigger={onTrigger} />,
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
  });

  it("handles space key", () => {
    render(<GlobalShortcut shortcut=" " onTrigger={onTrigger} />);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });
});
