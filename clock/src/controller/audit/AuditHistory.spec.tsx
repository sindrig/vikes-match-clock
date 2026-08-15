import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AuditHistoryModal from "./AuditHistory";
import type { AuditHistoryState } from "./useAuditHistory";

const mockUseAuditHistory = vi.fn<() => AuditHistoryState>();

vi.mock("./useAuditHistory", async () => {
  const actual =
    await vi.importActual<typeof import("./useAuditHistory")>(
      "./useAuditHistory",
    );
  return {
    ...actual,
    useAuditHistory: (...args: Parameters<typeof actual.useAuditHistory>) =>
      mockUseAuditHistory(...args),
  };
});

vi.mock("../../contexts/LocalStateContext", () => ({
  useLocalState: () => ({ listenPrefix: "vikuti" }),
}));

const resetEvent = {
  id: "event-reset",
  timestamp: 1700000000000,
  uid: "operator-1",
  sessionId: "session-abc",
  action: "match.reset",
  stateArea: "match",
  changes: { homeScore: 0, awayScore: 0, started: 0 },
};

const olderEvent = {
  id: "event-older",
  timestamp: 1690000000000,
  uid: "operator-2",
  sessionId: "session-def",
  action: "match.start",
  stateArea: "match",
  changes: { started: 1690000000000 },
};

const renderModal = () =>
  render(<AuditHistoryModal open={true} onClose={() => undefined} />);

describe("AuditHistoryModal", () => {
  beforeEach(() => {
    mockUseAuditHistory.mockReset();
  });

  it("renders newest events first with the reset event's details", () => {
    mockUseAuditHistory.mockReturnValue({
      events: [resetEvent, olderEvent],
      loading: false,
      error: null,
    });

    renderModal();

    // Both events present.
    expect(screen.getByText("Endurstillt")).toBeTruthy();
    expect(screen.getByText("Ræst")).toBeTruthy();

    // Newest event (reset) rendered above the older event.
    const actionNodes = screen.getAllByText(/Endurstillt|Ræst/);
    const resetIndex = actionNodes.findIndex(
      (n) => n.textContent === "Endurstillt",
    );
    const startIndex = actionNodes.findIndex((n) => n.textContent === "Ræst");
    expect(resetIndex).toBeLessThan(startIndex);

    // Reset details visible: identity, session, area, changed fields.
    expect(screen.getByText(/operator-1/)).toBeTruthy();
    expect(screen.getAllByText(/session-/).length).toBeGreaterThan(0);
    expect(screen.getByText(/homeScore, awayScore, started/)).toBeTruthy();
  });

  it("shows an explicit empty state when there are no records", () => {
    mockUseAuditHistory.mockReturnValue({
      events: [],
      loading: false,
      error: null,
    });

    renderModal();

    expect(screen.getByText(/Engin breytingasaga er tiltæk/)).toBeTruthy();
  });

  it("shows a permission error state when the read fails", () => {
    mockUseAuditHistory.mockReturnValue({
      events: [],
      loading: false,
      error: "Gat ekki sótt breytingasögu (heimild gæti vantað).",
    });

    renderModal();

    expect(
      screen.getByText("Gat ekki sótt breytingasögu (heimild gæti vantað)."),
    ).toBeTruthy();
  });

  it("shows a loading state while the subscription is pending", () => {
    mockUseAuditHistory.mockReturnValue({
      events: [],
      loading: true,
      error: null,
    });

    renderModal();

    expect(screen.getByText(/Hleð breytingasögu/)).toBeTruthy();
  });
});
