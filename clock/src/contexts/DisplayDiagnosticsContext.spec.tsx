import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import {
  DisplayDiagnosticsProvider,
  useDisplayDiagnostics,
} from "./DisplayDiagnosticsContext";
import useScreenPresence, {
  ScreenPresenceDiagnostics,
} from "../hooks/useScreenPresence";

vi.mock("../hooks/useScreenPresence", () => ({
  default: vi.fn(),
}));

const mockedUseScreenPresence = vi.mocked(useScreenPresence);

const Reporter = ({ error }: { error: string | null }) => {
  const { reportError } = useDisplayDiagnostics();
  React.useEffect(() => {
    reportError(error);
  }, [error, reportError]);
  return <div data-testid="consumer">Consumer</div>;
};

const renderProvider = (error: string | null) =>
  render(
    <DisplayDiagnosticsProvider listenPrefix="vikuti" displayKind="perimeter">
      <Reporter error={error} />
    </DisplayDiagnosticsProvider>,
  );

const lastPresenceCall = (): [string, string, ScreenPresenceDiagnostics] => {
  const calls = mockedUseScreenPresence.mock.calls;
  return calls[calls.length - 1] as unknown as [
    string,
    string,
    ScreenPresenceDiagnostics,
  ];
};

describe("DisplayDiagnosticsProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards presence reporting to useScreenPresence", () => {
    renderProvider(null);

    expect(mockedUseScreenPresence).toHaveBeenCalledWith(
      "vikuti",
      "perimeter",
      expect.objectContaining<Partial<ScreenPresenceDiagnostics>>({
        error: null,
      }),
    );
  });

  it("carries a reported error into the presence diagnostics", () => {
    renderProvider("Deck failed");

    const lastCall = lastPresenceCall();
    expect(lastCall[0]).toBe("vikuti");
    expect(lastCall[1]).toBe("perimeter");
    expect(lastCall[2].error).toBe("Deck failed");
    expect(lastCall[2].label).toMatch(/^Skjár /);
  });

  it("clears the error when a screen reports null", () => {
    const { rerender } = renderProvider("WebGL failure");

    const erroredCall = lastPresenceCall();
    expect(erroredCall[2].error).toBe("WebGL failure");

    rerender(
      <DisplayDiagnosticsProvider listenPrefix="vikuti" displayKind="perimeter">
        <Reporter error={null} />
      </DisplayDiagnosticsProvider>,
    );

    const clearedCall = lastPresenceCall();
    expect(clearedCall[2].error).toBe(null);
  });
});
