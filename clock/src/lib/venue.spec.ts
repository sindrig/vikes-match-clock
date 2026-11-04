import { describe, expect, it } from "vitest";

import { parseLocations, parseVenue } from "../contexts/firebaseParsers";
import { getTeamId } from "./matchUtils";
import { metadataUpdates, parsePitchIds, parseVenueId } from "./venue";
import { minimalPerimeterDisplay } from "./venue.fixtures";

describe("venue identifiers", () => {
  it.each([1, 2058, Number.MAX_SAFE_INTEGER, "2058", " 2058 ", "02058"])(
    "accepts positive safe decimal identifier %s",
    (value) => {
      expect(parseVenueId(value)).toBe(Number(value));
      const parsed = parseLocations({ test: { config: { homeTeam: value } } });
      expect(getTeamId(parsed!.venues, "test")).toBe(Number(value));
    },
  );

  it.each([
    undefined,
    null,
    false,
    true,
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    "9007199254740993",
    "",
    " ",
    "0",
    "-1",
    "1.5",
    "1e3",
    "0x809",
    "+2058",
    "2058club",
    [],
    [2058],
    {},
  ])("falls back only for missing or invalid identifier %s", (value) => {
    expect(parseVenueId(value)).toBeUndefined();
    const parsed = parseLocations({ test: { config: { homeTeam: value } } });
    expect(parsed!.venues.test!.config.homeTeam).toBeUndefined();
    expect(getTeamId(parsed!.venues, "test")).toBe(2492);
  });

  it.each([undefined, null, false, "2058", [], {}])(
    "tolerates old missing or malformed config %s",
    (config) => {
      const parsed = parseLocations({ test: { config } });
      expect(getTeamId(parsed!.venues, "test")).toBe(2492);
      expect(getTeamId(parsed!.venues, "unknown")).toBe(2492);
      expect(getTeamId(parsed!.venues, "constructor")).toBe(2492);
    },
  );

  it("normalizes mixed legacy pitch IDs without coercing malformed values", () => {
    expect(
      parsePitchIds([
        102,
        "103",
        " 104 ",
        null,
        false,
        {},
        [],
        0,
        -1,
        1.5,
        "105bad",
        "1e3",
        Infinity,
        "9007199254740993",
      ]),
    ).toEqual([102, 103, 104]);
    expect(parsePitchIds("102, 103")).toEqual([]);
  });
});

describe("shared venue parsing", () => {
  it.each([undefined, null, [], {}])(
    "preserves config and web mapping independently of screens %s",
    (screens) => {
      const parsed = parseLocations({
        test: {
          name: "Legacy venue name",
          pitchIds: [102, "103"],
          config: { homeTeam: "2058", weatherStation: "reykjavik" },
          perimeterDisplay: minimalPerimeterDisplay,
          screens,
          futureVenueMetadata: { keep: true },
        },
      });
      expect(parsed!.available).toEqual(["test"]);
      expect(parsed!.screens).toEqual([]);
      expect(parsed!.venues.test).toMatchObject({
        label: "Legacy venue name",
        pitchIds: [102, 103],
        config: { homeTeam: 2058, weatherStation: "reykjavik" },
        perimeterDisplay: minimalPerimeterDisplay,
        futureVenueMetadata: { keep: true },
      });
      expect(getTeamId(parsed!.venues, "test")).toBe(2058);
    },
  );

  it("keeps sparse and keyed screen definitions and validates their viewport fields", () => {
    const parsed = parseLocations({
      sparse: {
        screens: [
          null,
          {
            key: "out",
            name: "Outside",
            style: { width: "512", height: "400", color: "red" },
            futureScreen: true,
          },
        ],
      },
      keyed: {
        screens: {
          main: {
            key: "in",
            name: "Inside",
            fontSize: "80%",
            style: { width: 1920, height: 1080 },
          },
          bad: false,
        },
      },
      malformed: {
        screens: [
          {
            key: 5,
            name: false,
            fontSize: 99,
            style: { width: Infinity, height: -1 },
          },
          [],
          null,
          false,
        ],
      },
    });
    expect(Object.keys(parsed!.venues.sparse!.screens)).toEqual(["1"]);
    expect(Object.keys(parsed!.venues.keyed!.screens)).toEqual(["main"]);
    expect(parsed!.screens.map(({ key, screen }) => [key, screen])).toEqual([
      [
        "sparse",
        {
          key: "out",
          name: "Outside",
          style: { width: 512, height: 400, color: "red" },
          futureScreen: true,
        },
      ],
      [
        "keyed",
        {
          key: "in",
          name: "Inside",
          fontSize: "80%",
          style: { width: 1920, height: 1080 },
        },
      ],
      ["malformed", { key: "", name: "", style: { width: 512, height: 400 } }],
    ]);
  });

  it("rejects invalid venue records without losing valid neighbours", () => {
    expect(parseVenue([], "test")).toBeNull();
    const parsed = parseLocations({
      test: { config: { homeTeam: 2058 } },
      bad: null,
      array: [],
      scalar: 5,
    });
    expect(parsed!.available).toEqual(["test"]);
    expect(parsed!.venues).toHaveProperty("test");
  });
});

describe("metadata updates", () => {
  it("edits legacy compatibility keys in place, including deletions", () => {
    const { compatibilityKeys, ...mapping } = minimalPerimeterDisplay;
    const parsed = parseVenue(
      {
        perimeterDisplay: {
          ...mapping,
          compatibility: { ...compatibilityKeys, future: { keep: true } },
        },
      },
      "test",
    )!;
    const published = {
      ...parsed.perimeterDisplay!,
      compatibilityKeys: {
        ...compatibilityKeys,
        base: { "3": "strip" },
      },
    };
    expect(
      metadataUpdates(
        parsed.perimeterDisplay,
        published,
        "perimeterDisplay",
        parsed.document?.perimeterDisplay,
      ),
    ).toEqual({
      "perimeterDisplay/compatibility/base/1": null,
      "perimeterDisplay/compatibility/base/3": "strip",
    });
    expect(
      metadataUpdates(
        parsed.perimeterDisplay,
        {
          ...published,
          compatibilityKeys: { base: {}, overlay: {} },
        },
        "perimeterDisplay",
        parsed.document?.perimeterDisplay,
      ),
    ).toEqual({
      "perimeterDisplay/compatibility/base/1": null,
      "perimeterDisplay/compatibility/overlay/2": null,
    });
  });

  it.each(["array", "map"])(
    "keeps legacy logical-screen %s child keys when editing validated IDs",
    (shape) => {
      const screen = {
        ...minimalPerimeterDisplay.logicalScreens.strip,
        future: true,
      };
      const parsed = parseVenue(
        {
          perimeterDisplay: {
            ...minimalPerimeterDisplay,
            logicalScreens:
              shape === "array" ? [screen] : { "legacy-key": screen },
          },
        },
        "test",
      )!;
      const published = {
        ...parsed.perimeterDisplay!,
        logicalScreens: {
          strip: {
            ...minimalPerimeterDisplay.logicalScreens.strip!,
            name: "Renamed strip",
          },
        },
      };
      expect(
        metadataUpdates(
          parsed.perimeterDisplay,
          published,
          "perimeterDisplay",
          parsed.document?.perimeterDisplay,
        ),
      ).toEqual({
        [`perimeterDisplay/logicalScreens/${shape === "array" ? "0" : "legacy-key"}/name`]:
          "Renamed strip",
      });
    },
  );

  it("writes only changed leaves and explicit removals", () => {
    expect(
      metadataUpdates(
        { homeTeam: 2058, weather: { station: "rkv" } },
        { weather: { station: "rkv" } },
        "config",
      ),
    ).toEqual({ "config/homeTeam": null });
    expect(metadataUpdates({ a: [1, 2] }, { a: [1, 3] }, "test")).toEqual({
      "test/a/1": 3,
    });
  });
});
