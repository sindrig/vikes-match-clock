import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TeamLineup } from "../../../api/client";
import apiConfig from "../../../apiConfig";
import ResolveRosterModal from "./ResolveRosterModal";

const fetchMock = vi.fn<typeof fetch>();
const starters = Array.from({ length: 11 }, (_, i) => i + 1);
const onConfirm = vi.fn();

const fillStarters = (): void => {
  screen
    .getAllByRole("spinbutton")
    .slice(0, 11)
    .forEach((input, i) => {
      fireEvent.change(input, { target: { value: String(i + 1) } });
    });
};

const renderModal = (): void => {
  render(
    <ResolveRosterModal
      open
      teamId={2492}
      teamName="Víkingur"
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResolveRosterModal generated SDK integration", () => {
  it("posts the typed request and saves the shared lineup conversion after confirmation", async () => {
    const lineup: TeamLineup = {
      players: [
        {
          person: { id: 10, name: "Keeper" },
          shirtNumber: 1,
          goalkeeper: true,
          captain: true,
          startingLineup: true,
        },
        { person: { id: 0, name: "#12" }, shirtNumber: 12 },
      ],
      officials: [{ person: { id: 99, name: "Coach" } }],
    };
    fetchMock.mockResolvedValueOnce(Response.json(lineup));
    renderModal();
    fillStarters();
    const substitute = screen.getAllByRole("spinbutton")[11];
    expect(substitute).toBeDefined();
    if (!substitute) throw new Error("Missing substitute input");
    fireEvent.change(substitute, { target: { value: "12" } });

    fireEvent.click(screen.getByRole("button", { name: "Senda inn" }));

    expect(await screen.findByText("Keeper")).toBeInTheDocument();
    expect(screen.getByText("#12")).toBeInTheDocument();
    expect(screen.getByText("Coach")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request: unknown = fetchMock.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    if (!(request instanceof Request)) throw new Error("Expected SDK Request");
    expect(request.url).toBe(`${apiConfig.gateWayUrl}v3/2492/resolve-roster`);
    expect(request.method).toBe("POST");
    expect(request.headers.get("Content-Type")).toBe("application/json");
    expect(await request.json()).toEqual({
      starters,
      substitutes: [12],
    });
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Vista leikmannahóp" }));

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith([
      { id: 10, name: "Keeper", number: 1, role: "Markmaður", show: true },
      { id: 0, name: "#12", number: 12, role: "Varamáður", show: false },
      { id: 99, name: "Coach", role: "Þjálfari", show: false },
    ]);
  });

  it.each(["http", "network"])(
    "shows a %s error and allows retry with no substitutes",
    async (failure) => {
      if (failure === "http") {
        fetchMock.mockResolvedValueOnce(
          Response.json({ detail: "Upstream unavailable" }, { status: 502 }),
        );
      } else {
        fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable"));
      }
      fetchMock.mockResolvedValueOnce(
        Response.json({ players: [], officials: [] }),
      );
      renderModal();
      fillStarters();

      fireEvent.click(screen.getByRole("button", { name: "Senda inn" }));

      expect(
        await screen.findByText("Error fetching roster"),
      ).toBeInTheDocument();
      expect(onConfirm).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: "Vista leikmannahóp" }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Senda inn" }));

      expect(
        await screen.findByRole("button", { name: "Vista leikmannahóp" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Error fetching roster"),
      ).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const request: unknown = fetchMock.mock.calls[1]?.[0];
      if (!(request instanceof Request))
        throw new Error("Expected SDK Request");
      expect(await request.json()).toEqual({ starters, substitutes: [] });
    },
  );

  it("keeps invalid and duplicate input local without calling the SDK", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Senda inn" }));
    expect(
      screen.getByText("Allir byrjunarliðsmenn verða að vera fylltir út"),
    ).toBeInTheDocument();
    fillStarters();
    const substitute = screen.getAllByRole("spinbutton")[11];
    if (!substitute) throw new Error("Missing substitute input");
    fireEvent.change(substitute, { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Senda inn" }));
    expect(
      screen.getByText("Eingöngu jákvæðar tölur eru leyfðar"),
    ).toBeInTheDocument();
    fireEvent.change(substitute, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Senda inn" }));

    expect(screen.getByText("Tvítekið númer: 1")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
