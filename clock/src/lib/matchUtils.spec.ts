import { describe, expect, it } from "vitest";

import type { TeamLineup, TeamPlayer } from "../api/client";
import { transformLineups, transformSingleLineup } from "./matchUtils";

describe("transformSingleLineup", () => {
  it.each([
    [true, true, true, "Markmaður"],
    [true, true, false, "Markmaður"],
    [true, false, true, "Varamarkmaður"],
    [true, false, false, "Varamarkmaður"],
    [false, true, true, "Fyrirliði"],
    [false, false, true, "Fyrirliði"],
    [false, true, false, "Leikmaður"],
    [false, false, false, "Varamáður"],
  ])(
    "maps goalkeeper=%s startingLineup=%s captain=%s to %s",
    (goalkeeper, startingLineup, captain, role) => {
      const player: TeamPlayer = {
        person: { id: 42, name: "Test Player" },
        shirtNumber: 7,
        goalkeeper,
        startingLineup,
        captain,
      };

      expect(transformSingleLineup({ players: [player] })).toEqual([
        {
          id: 42,
          name: "Test Player",
          number: 7,
          role,
          show: startingLineup,
        },
      ]);
    },
  );

  it("defaults absent flags and arrays and omits absent or null numbers", () => {
    expect(transformSingleLineup({})).toEqual([]);
    expect(
      transformSingleLineup({
        players: [
          { person: { id: 1, name: "No number" } },
          { person: { id: 2, name: "Null number" }, shirtNumber: null },
          { person: { id: 3, name: "Zero number" }, shirtNumber: 0 },
        ],
      }),
    ).toEqual([
      { id: 1, name: "No number", role: "Varamáður", show: false },
      { id: 2, name: "Null number", role: "Varamáður", show: false },
      {
        id: 3,
        name: "Zero number",
        number: 0,
        role: "Varamáður",
        show: false,
      },
    ]);
  });

  it("preserves player order and unresolved names, then appends hidden coaches", () => {
    const lineup: TeamLineup = {
      players: [
        {
          person: { id: 11, name: "Starter" },
          shirtNumber: 99,
          startingLineup: true,
        },
        { person: { id: 0, name: "#2" }, shirtNumber: 2 },
      ],
      officials: [
        { person: { id: 99, name: "Coach" }, role: "HEAD_COACH" },
        { person: { id: 100, name: "Assistant" } },
      ],
    };
    const original = structuredClone(lineup);
    const players = transformSingleLineup(lineup);

    expect(players).toEqual([
      {
        id: 11,
        name: "Starter",
        number: 99,
        role: "Leikmaður",
        show: true,
      },
      { id: 0, name: "#2", number: 2, role: "Varamáður", show: false },
      { id: 99, name: "Coach", role: "Þjálfari", show: false },
      { id: 100, name: "Assistant", role: "Þjálfari", show: false },
    ]);
    expect(lineup).toEqual(original);
    expect(players[0]).not.toBe(lineup.players?.[0]);
  });
});

describe("transformLineups", () => {
  it("keeps home and away separate using the same lineup conversion", () => {
    const home: TeamLineup = {
      players: [
        {
          person: { id: 1, name: "Home captain" },
          shirtNumber: 8,
          captain: true,
          startingLineup: true,
        },
      ],
      officials: [{ person: { id: 2, name: "Home coach" } }],
    };
    const away: TeamLineup = {
      players: [
        {
          person: { id: 3, name: "Away keeper" },
          shirtNumber: 1,
          goalkeeper: true,
        },
      ],
    };
    const original = structuredClone({ home, away });

    expect(transformLineups({ home, away })).toEqual({
      home: [
        {
          id: 1,
          name: "Home captain",
          number: 8,
          role: "Fyrirliði",
          show: true,
        },
        { id: 2, name: "Home coach", role: "Þjálfari", show: false },
      ],
      away: [
        {
          id: 3,
          name: "Away keeper",
          number: 1,
          role: "Varamarkmaður",
          show: false,
        },
      ],
    });
    expect({ home, away }).toEqual(original);
    expect(transformLineups({ home: {}, away: {} })).toEqual({
      home: [],
      away: [],
    });
  });
});
