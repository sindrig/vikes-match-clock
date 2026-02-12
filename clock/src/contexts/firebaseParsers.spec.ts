import { describe, it, expect } from "vitest";
import {
  parseLocations,
  parseMatch,
  parseController,
  parseView,
} from "./firebaseParsers";
import { Sports, DEFAULT_HALFSTOPS } from "../constants";
import type {
  Match,
  ControllerState,
  ViewState,
  Asset,
  ViewPort,
  TwoMinPenalty,
} from "../types";

// Default values for tests
const defaultMatch: Match = {
  homeScore: 0,
  awayScore: 0,
  started: 0,
  timeElapsed: 0,
  halfStops: DEFAULT_HALFSTOPS[Sports.Football],
  homeTeam: "Home",
  awayTeam: "Away",
  homeTeamId: 1,
  awayTeamId: 2,
  injuryTime: 0,
  matchType: Sports.Football,
  home2min: [],
  away2min: [],
  timeout: 0,
  homeTimeouts: 0,
  awayTimeouts: 0,
  homeRedCards: 0,
  awayRedCards: 0,
  buzzer: false,
  countdown: false,
  showInjuryTime: false,
};

const defaultController: ControllerState = {
  selectedAssets: [],
  cycle: false,
  imageSeconds: 5,
  autoPlay: false,
  playing: false,
  assetView: "grid",
  view: "scoreboard",
  availableMatches: {},
  selectedMatch: null,
  currentAsset: null,
  refreshToken: "",
};

const defaultView: ViewState = {
  vp: {
    style: { height: 1080, width: 1920 },
    name: "Main",
    key: "main",
  },
  background: "#000000",
};

describe("firebaseParsers", () => {
  describe("parseLocations", () => {
    it("returns null for null input", () => {
      expect(parseLocations(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(parseLocations(undefined)).toBeNull();
    });

    it("returns null for non-object input", () => {
      expect(parseLocations("string")).toBeNull();
      expect(parseLocations(123)).toBeNull();
      expect(parseLocations(true)).toBeNull();
    });

    it("handles array input (coerces to object)", () => {
      const result = parseLocations([]);
      expect(result).toEqual({ available: [], screens: [] });
    });

    it("returns empty object with empty input", () => {
      const result = parseLocations({});
      expect(result).toEqual({ available: [], screens: [] });
    });

    it("parses single location with screens", () => {
      const data = {
        viken: {
          label: "Viken",
          screens: [
            {
              style: { height: 1080, width: 1920 },
              name: "Main Screen",
              key: "main",
            },
          ],
        },
      };

      const result = parseLocations(data);
      expect(result).not.toBeNull();
      expect(result!.available).toEqual(["viken"]);
      expect(result!.screens).toHaveLength(1);
      expect(result!.screens[0]).toEqual({
        screen: {
          style: { height: 1080, width: 1920 },
          name: "Main Screen",
          key: "main",
        },
        label: "Viken",
        key: "viken",
      });
    });

    it("uses location key as label when label is missing", () => {
      const data = {
        hasteinsvollur: {
          screens: [
            {
              style: { height: 1080, width: 1920 },
              name: "Screen",
              key: "s1",
            },
          ],
        },
      };

      const result = parseLocations(data);
      expect(result!.screens[0].label).toBe("hasteinsvollur");
    });

    it("parses multiple screens within single location", () => {
      const data = {
        viken: {
          label: "Viken",
          screens: [
            {
              style: { height: 1080, width: 1920 },
              name: "Main",
              key: "main",
            },
            {
              style: { height: 720, width: 1280 },
              name: "Secondary",
              key: "sec",
            },
          ],
        },
      };

      const result = parseLocations(data);
      expect(result!.screens).toHaveLength(2);
      expect(result!.screens[0].screen.name).toBe("Main");
      expect(result!.screens[1].screen.name).toBe("Secondary");
    });

    it("parses multiple locations", () => {
      const data = {
        viken: {
          label: "Viken Stadium",
          screens: [
            {
              style: { height: 1080, width: 1920 },
              name: "Main",
              key: "main",
            },
          ],
        },
        hasteinsvollur: {
          label: "Hasteinsvollur",
          screens: [
            {
              style: { height: 1080, width: 1920 },
              name: "Main",
              key: "main",
            },
          ],
        },
      };

      const result = parseLocations(data);
      expect(result!.available).toContain("viken");
      expect(result!.available).toContain("hasteinsvollur");
      expect(result!.screens).toHaveLength(2);
    });

    it("includes pitchIds when present", () => {
      const data = {
        viken: {
          label: "Viken",
          screens: [
            {
              style: { height: 1080, width: 1920 },
              name: "Main",
              key: "main",
            },
          ],
          pitchIds: ["pitch1", "pitch2"],
        },
      };

      const result = parseLocations(data);
      expect(result!.screens[0].pitchIds).toEqual(["pitch1", "pitch2"]);
    });

    it("omits pitchIds when not present", () => {
      const data = {
        viken: {
          label: "Viken",
          screens: [
            {
              style: { height: 1080, width: 1920 },
              name: "Main",
              key: "main",
            },
          ],
        },
      };

      const result = parseLocations(data);
      expect(result!.screens[0].pitchIds).toBeUndefined();
    });

    it("skips invalid location values", () => {
      const data = {
        viken: {
          label: "Viken",
          screens: [
            {
              style: { height: 1080, width: 1920 },
              name: "Main",
              key: "main",
            },
          ],
        },
        invalid: null,
        alsoInvalid: "string",
      };

      const result = parseLocations(data);
      expect(result!.available).toContain("viken");
      expect(result!.screens).toHaveLength(1);
    });

    it("handles screens array with invalid items", () => {
      const data = {
        viken: {
          label: "Viken",
          screens: [
            {
              style: { height: 1080, width: 1920 },
              name: "Valid",
              key: "v1",
            },
            null,
            "invalid",
            undefined,
            {
              style: { height: 720, width: 1280 },
              name: "Valid2",
              key: "v2",
            },
          ],
        },
      };

      const result = parseLocations(data);
      expect(result!.screens).toHaveLength(2);
      expect(result!.screens[0].screen.name).toBe("Valid");
      expect(result!.screens[1].screen.name).toBe("Valid2");
    });

    it("handles missing screens array", () => {
      const data = {
        viken: {
          label: "Viken",
        },
      };

      const result = parseLocations(data);
      expect(result!.screens).toHaveLength(0);
    });

    it("handles non-array screens value", () => {
      const data = {
        viken: {
          label: "Viken",
          screens: "not an array",
        },
      };

      const result = parseLocations(data);
      expect(result!.screens).toHaveLength(0);
    });

    it("includes optional fontSize in screen", () => {
      const data = {
        viken: {
          label: "Viken",
          screens: [
            {
              style: { height: 1080, width: 1920 },
              name: "Main",
              key: "main",
              fontSize: "48px",
            },
          ],
        },
      };

      const result = parseLocations(data);
      expect(result!.screens[0].screen.fontSize).toBe("48px");
    });
  });

  describe("parseMatch", () => {
    it("returns null for null input", () => {
      expect(parseMatch(null, defaultMatch)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(parseMatch(undefined, defaultMatch)).toBeNull();
    });

    it("returns null for non-object input", () => {
      expect(parseMatch("string", defaultMatch)).toBeNull();
      expect(parseMatch(123, defaultMatch)).toBeNull();
      expect(parseMatch(true, defaultMatch)).toBeNull();
    });

    it("returns default match for empty object", () => {
      const result = parseMatch({}, defaultMatch);
      expect(result).toEqual(defaultMatch);
    });

    it("parses numeric score fields", () => {
      const data = {
        homeScore: 3,
        awayScore: 2,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.homeScore).toBe(3);
      expect(result!.awayScore).toBe(2);
    });

    it("coerces non-numeric scores to default", () => {
      const data = {
        homeScore: "not a number",
        awayScore: null,
        timeout: "invalid",
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.homeScore).toBe(defaultMatch.homeScore);
      expect(result!.awayScore).toBe(defaultMatch.awayScore);
      expect(result!.timeout).toBe(defaultMatch.timeout);
    });

    it("parses string team fields", () => {
      const data = {
        homeTeam: "Víkingur R",
        awayTeam: "Breiðablik",
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.homeTeam).toBe("Víkingur R");
      expect(result!.awayTeam).toBe("Breiðablik");
    });

    it("uses default when team fields are not strings", () => {
      const data = {
        homeTeam: 123,
        awayTeam: null,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.homeTeam).toBe(defaultMatch.homeTeam);
      expect(result!.awayTeam).toBe(defaultMatch.awayTeam);
    });

    it("parses numeric team ID fields", () => {
      const data = {
        homeTeamId: 100,
        awayTeamId: 200,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.homeTeamId).toBe(100);
      expect(result!.awayTeamId).toBe(200);
    });

    it("uses default when team IDs are not numbers", () => {
      const data = {
        homeTeamId: "100",
        awayTeamId: null,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.homeTeamId).toBe(defaultMatch.homeTeamId);
      expect(result!.awayTeamId).toBe(defaultMatch.awayTeamId);
    });

    it("parses all numeric timing fields", () => {
      const data = {
        started: 1000,
        timeElapsed: 2500,
        injuryTime: 300,
        timeout: 3000,
        homeTimeouts: 2,
        awayTimeouts: 1,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.started).toBe(1000);
      expect(result!.timeElapsed).toBe(2500);
      expect(result!.injuryTime).toBe(300);
      expect(result!.timeout).toBe(3000);
      expect(result!.homeTimeouts).toBe(2);
      expect(result!.awayTimeouts).toBe(1);
    });

    it("parses halfStops array", () => {
      const data = {
        halfStops: [45000, 90000],
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.halfStops).toEqual([45000, 90000]);
    });

    it("uses default halfStops when not array", () => {
      const data = {
        halfStops: "not an array",
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.halfStops).toEqual(defaultMatch.halfStops);
    });

    it("parses boolean fields", () => {
      const data = {
        countdown: true,
        showInjuryTime: true,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.countdown).toBe(true);
      expect(result!.showInjuryTime).toBe(true);
    });

    it("uses default for non-boolean countdown/showInjuryTime", () => {
      const data = {
        countdown: "true",
        showInjuryTime: 1,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.countdown).toBe(defaultMatch.countdown);
      expect(result!.showInjuryTime).toBe(defaultMatch.showInjuryTime);
    });

    it("parses matchType string field", () => {
      const data = {
        matchType: Sports.Handball,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.matchType).toBe(Sports.Handball);
    });

    it("uses default matchType when not string", () => {
      const data = {
        matchType: 123,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.matchType).toBe(defaultMatch.matchType);
    });

    it("parses optional matchStartTime", () => {
      const data = {
        matchStartTime: "2024-02-11T14:30:00Z",
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.matchStartTime).toBe("2024-02-11T14:30:00Z");
    });

    it("omits matchStartTime when not string", () => {
      const data = {
        matchStartTime: 123,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.matchStartTime).toBeUndefined();
    });

    it("parses red card fields", () => {
      const data = {
        homeRedCards: 2,
        awayRedCards: 1,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.homeRedCards).toBe(2);
      expect(result!.awayRedCards).toBe(1);
    });

    it("uses default for non-numeric red cards", () => {
      const data = {
        homeRedCards: "2",
        awayRedCards: null,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.homeRedCards).toBe(defaultMatch.homeRedCards);
      expect(result!.awayRedCards).toBe(defaultMatch.awayRedCards);
    });

    it("parses buzzer as number", () => {
      const data = {
        buzzer: 5000,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.buzzer).toBe(5000);
    });

    it("parses buzzer as false specifically", () => {
      const data = {
        buzzer: false,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.buzzer).toBe(false);
    });

    it("uses default buzzer for invalid values", () => {
      const data = {
        buzzer: "invalid",
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.buzzer).toBe(defaultMatch.buzzer);
    });

    it("parses 2-minute penalty arrays", () => {
      const home2minData: TwoMinPenalty[] = [
        {
          atTimeElapsed: 1000,
          key: "p1",
          penaltyLength: 120000,
        },
        {
          atTimeElapsed: 3000,
          key: "p2",
          penaltyLength: 120000,
        },
      ];

      const data = {
        home2min: home2minData,
        away2min: [],
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.home2min).toEqual(home2minData);
      expect(result!.away2min).toEqual([]);
    });

    it("filters invalid items from 2-minute penalty arrays", () => {
      const data = {
        home2min: [
          {
            atTimeElapsed: 1000,
            key: "p1",
            penaltyLength: 120000,
          },
          null,
          {
            // Missing required field
            atTimeElapsed: 2000,
            key: "p2",
          },
          {
            atTimeElapsed: 3000,
            key: "p3",
            penaltyLength: 120000,
          },
        ],
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.home2min).toHaveLength(2);
      expect(result!.home2min[0].key).toBe("p1");
      expect(result!.home2min[1].key).toBe("p3");
    });

    it("uses default 2-minute arrays when not arrays", () => {
      const data = {
        home2min: "not an array",
        away2min: 123,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.home2min).toEqual([]);
      expect(result!.away2min).toEqual([]);
    });

    it("merges all fields with defaults properly", () => {
      const data = {
        homeScore: 5,
        matchType: Sports.Handball,
        countdown: true,
        buzzer: false,
      };

      const result = parseMatch(data, defaultMatch);
      // Provided fields
      expect(result!.homeScore).toBe(5);
      expect(result!.matchType).toBe(Sports.Handball);
      expect(result!.countdown).toBe(true);
      expect(result!.buzzer).toBe(false);
      // Default fields
      expect(result!.awayScore).toBe(defaultMatch.awayScore);
      expect(result!.homeTeam).toBe(defaultMatch.homeTeam);
      expect(result!.halfStops).toEqual(defaultMatch.halfStops);
    });
  });

  describe("parseController", () => {
    it("returns null for null input", () => {
      expect(parseController(null, defaultController)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(parseController(undefined, defaultController)).toBeNull();
    });

    it("returns null for non-object input", () => {
      expect(parseController("string", defaultController)).toBeNull();
      expect(parseController(123, defaultController)).toBeNull();
    });

    it("returns default controller for empty object", () => {
      const result = parseController({}, defaultController);
      expect(result).toEqual(defaultController);
    });

    it("parses selectedAssets array", () => {
      const assets: Asset[] = [
        { key: "a1", type: "image" },
        { key: "a2", type: "video" },
      ];
      const data = {
        selectedAssets: assets,
      };

      const result = parseController(data, defaultController);
      expect(result!.selectedAssets).toEqual(assets);
    });

    it("filters invalid items from selectedAssets", () => {
      const data = {
        selectedAssets: [
          { key: "a1", type: "image" },
          null,
          { key: "a2" }, // Missing required 'type' field
          { type: "video" }, // Missing required 'key' field
          { key: "a3", type: "text" },
        ],
      };

      const result = parseController(data, defaultController);
      expect(result!.selectedAssets).toHaveLength(2);
      expect(result!.selectedAssets[0].key).toBe("a1");
      expect(result!.selectedAssets[1].key).toBe("a3");
    });

    it("uses default selectedAssets when not array", () => {
      const data = {
        selectedAssets: "not an array",
      };

      const result = parseController(data, defaultController);
      expect(result!.selectedAssets).toEqual([]);
    });

    it("parses boolean fields", () => {
      const data = {
        cycle: true,
        autoPlay: true,
        playing: false,
      };

      const result = parseController(data, defaultController);
      expect(result!.cycle).toBe(true);
      expect(result!.autoPlay).toBe(true);
      expect(result!.playing).toBe(false);
    });

    it("uses default for non-boolean boolean fields", () => {
      const data = {
        cycle: "true",
        autoPlay: 1,
        playing: null,
      };

      const result = parseController(data, defaultController);
      expect(result!.cycle).toBe(defaultController.cycle);
      expect(result!.autoPlay).toBe(defaultController.autoPlay);
      expect(result!.playing).toBe(defaultController.playing);
    });

    it("parses numeric imageSeconds", () => {
      const data = {
        imageSeconds: 10,
      };

      const result = parseController(data, defaultController);
      expect(result!.imageSeconds).toBe(10);
    });

    it("uses default imageSeconds for non-numeric", () => {
      const data = {
        imageSeconds: "10",
      };

      const result = parseController(data, defaultController);
      expect(result!.imageSeconds).toBe(defaultController.imageSeconds);
    });

    it("parses string fields", () => {
      const data = {
        assetView: "list",
        view: "idle",
        refreshToken: "token123",
        tab: "assets",
      };

      const result = parseController(data, defaultController);
      expect(result!.assetView).toBe("list");
      expect(result!.view).toBe("idle");
      expect(result!.refreshToken).toBe("token123");
      expect(result!.tab).toBe("assets");
    });

    it("uses default for non-string string fields", () => {
      const data = {
        assetView: 123,
        view: null,
        refreshToken: true,
      };

      const result = parseController(data, defaultController);
      expect(result!.assetView).toBe(defaultController.assetView);
      expect(result!.view).toBe(defaultController.view);
      expect(result!.refreshToken).toBe(defaultController.refreshToken);
    });

    it("parses availableMatches object", () => {
      const matches = {
        match1: {
          group: "A",
          sex: "M",
          players: {},
        },
      };
      const data = {
        availableMatches: matches,
      };

      const result = parseController(data, defaultController);
      expect(result!.availableMatches).toEqual(matches);
    });

    it("uses default availableMatches when not object", () => {
      const data = {
        availableMatches: "not an object",
      };

      const result = parseController(data, defaultController);
      expect(result!.availableMatches).toEqual(
        defaultController.availableMatches,
      );
    });

    it("parses selectedMatch string", () => {
      const data = {
        selectedMatch: "match123",
      };

      const result = parseController(data, defaultController);
      expect(result!.selectedMatch).toBe("match123");
    });

    it("uses null for non-string selectedMatch", () => {
      const data = {
        selectedMatch: 123,
      };

      const result = parseController(data, defaultController);
      expect(result!.selectedMatch).toBeNull();
    });

    it("parses currentAsset object", () => {
      const currentAsset = {
        asset: { key: "a1", type: "image" },
        time: 5000,
      };
      const data = {
        currentAsset,
      };

      const result = parseController(data, defaultController);
      expect(result!.currentAsset).toEqual(currentAsset);
    });

    it("uses null for non-object currentAsset", () => {
      const data = {
        currentAsset: "not an object",
      };

      const result = parseController(data, defaultController);
      expect(result!.currentAsset).toBeNull();
    });

    it("merges all fields with defaults properly", () => {
      const data = {
        cycle: true,
        imageSeconds: 8,
        view: "assets",
      };

      const result = parseController(data, defaultController);
      // Provided fields
      expect(result!.cycle).toBe(true);
      expect(result!.imageSeconds).toBe(8);
      expect(result!.view).toBe("assets");
      // Default fields
      expect(result!.autoPlay).toBe(defaultController.autoPlay);
      expect(result!.selectedAssets).toEqual([]);
      expect(result!.selectedMatch).toBeNull();
    });
  });

  describe("parseView", () => {
    it("returns null for null input", () => {
      expect(parseView(null, defaultView)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(parseView(undefined, defaultView)).toBeNull();
    });

    it("returns null for non-object input", () => {
      expect(parseView("string", defaultView)).toBeNull();
      expect(parseView(123, defaultView)).toBeNull();
    });

    it("returns default view for empty object", () => {
      const result = parseView({}, defaultView);
      expect(result).toEqual(defaultView);
    });

    it("parses viewport object", () => {
      const vp: ViewPort = {
        style: { height: 720, width: 1280 },
        name: "Small",
        key: "small",
      };
      const data = {
        vp,
      };

      const result = parseView(data, defaultView);
      expect(result!.vp).toEqual(vp);
    });

    it("uses default vp when not object", () => {
      const data = {
        vp: "not an object",
      };

      const result = parseView(data, defaultView);
      expect(result!.vp).toEqual(defaultView.vp);
    });

    it("parses background string", () => {
      const data = {
        background: "#FF0000",
      };

      const result = parseView(data, defaultView);
      expect(result!.background).toBe("#FF0000");
    });

    it("uses default background for non-string", () => {
      const data = {
        background: 123,
      };

      const result = parseView(data, defaultView);
      expect(result!.background).toBe(defaultView.background);
    });

    it("parses optional idleImage", () => {
      const data = {
        idleImage: "https://example.com/image.png",
      };

      const result = parseView(data, defaultView);
      expect(result!.idleImage).toBe("https://example.com/image.png");
    });

    it("omits idleImage when not string", () => {
      const data = {
        idleImage: 123,
      };

      const result = parseView(data, defaultView);
      expect(result!.idleImage).toBeUndefined();
    });

    it("handles viewport with optional fontSize", () => {
      const vp: ViewPort = {
        style: { height: 1080, width: 1920 },
        fontSize: "32px",
        name: "Main",
        key: "main",
      };
      const data = {
        vp,
      };

      const result = parseView(data, defaultView);
      expect(result!.vp.fontSize).toBe("32px");
    });

    it("merges all fields with defaults properly", () => {
      const vp: ViewPort = {
        style: { height: 720, width: 1280 },
        name: "Small",
        key: "small",
      };
      const data = {
        vp,
        background: "#FFFFFF",
      };

      const result = parseView(data, defaultView);
      // Provided fields
      expect(result!.vp).toEqual(vp);
      expect(result!.background).toBe("#FFFFFF");
      // Default fields (omitted idleImage should be undefined)
      expect(result!.idleImage).toBeUndefined();
    });

    it("includes all parts of viewport structure", () => {
      const vp: ViewPort = {
        style: { height: 540, width: 960 },
        fontSize: "24px",
        name: "Tablet",
        key: "tablet",
      };
      const data = {
        vp,
        background: "#333333",
        idleImage: "bg.jpg",
      };

      const result = parseView(data, defaultView);
      expect(result!.vp.style).toEqual({ height: 540, width: 960 });
      expect(result!.vp.fontSize).toBe("24px");
      expect(result!.vp.name).toBe("Tablet");
      expect(result!.vp.key).toBe("tablet");
      expect(result!.background).toBe("#333333");
      expect(result!.idleImage).toBe("bg.jpg");
    });
  });
});
