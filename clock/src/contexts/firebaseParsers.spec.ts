import { describe, it, expect } from "vitest";
import {
  parseLocations,
  parseMatch,
  parseController,
  parseView,
  parseTheme,
  parseCustomPresets,
} from "./firebaseParsers";
import { Sports, DEFAULT_HALFSTOPS, DEFAULT_THEME } from "../constants";
import type {
  Match,
  ControllerState,
  ViewState,
  ViewPort,
  TwoMinPenalty,
  ThemeConfig,
  CustomPreset,
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
  playing: false,
  assetView: "grid",
  view: "scoreboard",
  roster: { home: [], away: [] },
  currentAsset: null,
  refreshToken: "",
  queues: {},
  activeQueueId: null,
  tab: undefined,
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
      expect(result!.screens[0]!.label).toBe("hasteinsvollur");
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
      expect(result!.screens[0]!.screen.name).toBe("Main");
      expect(result!.screens[1]!.screen.name).toBe("Secondary");
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
      expect(result!.screens[0]!.pitchIds).toEqual(["pitch1", "pitch2"]);
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
      expect(result!.screens[0]!.pitchIds).toBeUndefined();
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
      expect(result!.screens[0]!.screen.name).toBe("Valid");
      expect(result!.screens[1]!.screen.name).toBe("Valid2");
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
      expect(result!.screens[0]!.screen.fontSize).toBe("48px");
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

    it("rejects invalid matchType 'basketball' and falls back to default", () => {
      const data = {
        matchType: "basketball",
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.matchType).toBe(defaultMatch.matchType);
    });

    it("rejects empty matchType and falls back to default", () => {
      const data = {
        matchType: "",
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.matchType).toBe(defaultMatch.matchType);
    });

    it("rejects partial matchType 'foot' and falls back to default", () => {
      const data = {
        matchType: "foot",
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.matchType).toBe(defaultMatch.matchType);
    });

    it("accepts valid matchType 'football'", () => {
      const data = {
        matchType: "football",
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.matchType).toBe("football");
    });

    it("accepts valid matchType 'handball'", () => {
      const data = {
        matchType: "handball",
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.matchType).toBe("handball");
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

    it("parses optional ksiMatchId", () => {
      const data = {
        ksiMatchId: 12345,
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.ksiMatchId).toBe(12345);
    });

    it("omits ksiMatchId when not number", () => {
      const data = {
        ksiMatchId: "12345",
      };

      const result = parseMatch(data, defaultMatch);
      expect(result!.ksiMatchId).toBeUndefined();
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
      expect(result!.home2min[0]!.key).toBe("p1");
      expect(result!.home2min[1]!.key).toBe("p3");
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

    it("uses empty queues when not object", () => {
      const data = {
        queues: "not an object",
      };

      const result = parseController(data, defaultController);
      expect(result!.queues).toEqual({});
    });

    it("uses default activeQueueId when not string", () => {
      const data = {
        activeQueueId: 123,
      };

      const result = parseController(data, defaultController);
      expect(result!.activeQueueId).toBe(defaultController.activeQueueId);
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

    it("parses roster object", () => {
      const roster = {
        home: [{ name: "Player A", number: "10", show: true, role: "FW" }],
        away: [{ name: "Player B", number: "1", show: true, role: "GK" }],
      };
      const data = {
        roster,
      };

      const result = parseController(data, defaultController);
      expect(result!.roster).toEqual(roster);
    });

    it("uses default roster when not object", () => {
      const data = {
        roster: "not an object",
      };

      const result = parseController(data, defaultController);
      expect(result!.roster).toEqual(defaultController.roster);
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
        view: "assets",
      };

      const result = parseController(data, defaultController);
      // Provided fields
      expect(result!.view).toBe("assets");
      // Default fields
      expect(result!.playing).toBe(defaultController.playing);
      expect(result!.queues).toEqual({});
      expect(result!.roster).toEqual({ home: [], away: [] });
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

    it("parses both blackoutStart and blackoutEnd when present", () => {
      const data = {
        blackoutStart: "20:00",
        blackoutEnd: "08:00",
      };

      const result = parseView(data, defaultView);
      expect(result!.blackoutStart).toBe("20:00");
      expect(result!.blackoutEnd).toBe("08:00");
    });

    it("rejects non-string blackoutStart and blackoutEnd values", () => {
      const data = {
        blackoutStart: 123,
        blackoutEnd: true,
      };

      const result = parseView(data, defaultView);
      expect(result!.blackoutStart).toBeUndefined();
      expect(result!.blackoutEnd).toBeUndefined();
    });

    it("omits blackoutStart and blackoutEnd when not provided (backward compatibility)", () => {
      const data = {};

      const result = parseView(data, defaultView);
      expect(result!.blackoutStart).toBeUndefined();
      expect(result!.blackoutEnd).toBeUndefined();
    });

    it("parses partial blackout fields independently", () => {
      const data = {
        blackoutStart: "20:00",
      };

      const result = parseView(data, defaultView);
      expect(result!.blackoutStart).toBe("20:00");
      expect(result!.blackoutEnd).toBeUndefined();
    });
  });

  // ---- parseTheme ----
  describe("parseTheme", () => {
    it("returns undefined for null", () => {
      expect(parseTheme(null)).toBeUndefined();
    });

    it("returns undefined for undefined", () => {
      expect(parseTheme(undefined)).toBeUndefined();
    });

    it("returns undefined for non-object (string)", () => {
      expect(parseTheme("string")).toBeUndefined();
    });

    it("returns undefined for non-object (number)", () => {
      expect(parseTheme(123)).toBeUndefined();
    });

    it("returns DEFAULT_THEME values for empty object", () => {
      const result = parseTheme({});
      expect(result).toBeDefined();
      expect(result!.scoreBoxBg).toBe(DEFAULT_THEME.scoreBoxBg);
      expect(result!.clockBg).toBe(DEFAULT_THEME.clockBg);
      expect(result!.backgroundImage).toBe(DEFAULT_THEME.backgroundImage);
    });

    it("returns a full ThemeConfig with all keys from DEFAULT_THEME", () => {
      const result = parseTheme({});
      const defaultKeys = Object.keys(DEFAULT_THEME).sort();
      const resultKeys = Object.keys(result!).sort();
      expect(resultKeys).toEqual(defaultKeys);
    });

    it("uses provided string values", () => {
      const result = parseTheme({
        scoreBoxBg: "#ff0000",
        clockBg: "#00ff00",
      });
      expect(result!.scoreBoxBg).toBe("#ff0000");
      expect(result!.clockBg).toBe("#00ff00");
    });

    it("falls back to default for non-string values", () => {
      const result = parseTheme({
        scoreBoxBg: 42,
        clockBg: true,
        scoreBoxColor: null,
      });
      expect(result!.scoreBoxBg).toBe(DEFAULT_THEME.scoreBoxBg);
      expect(result!.clockBg).toBe(DEFAULT_THEME.clockBg);
      expect(result!.scoreBoxColor).toBe(DEFAULT_THEME.scoreBoxColor);
    });

    it("ignores extra keys not in DEFAULT_THEME", () => {
      const result = parseTheme({
        scoreBoxBg: "#123",
        unknownField: "value",
        anotherExtra: 999,
      });
      expect(result!.scoreBoxBg).toBe("#123");
      expect(
        (result as unknown as Record<string, unknown>)["unknownField"],
      ).toBeUndefined();
    });

    it("handles mixed valid and invalid values", () => {
      const result = parseTheme({
        scoreBoxBg: "#aaa",
        scoreBoxColor: 123, // invalid → default
        clockBg: "rgba(0,0,0,0.5)",
        clockColor: undefined, // invalid → default
      });
      expect(result!.scoreBoxBg).toBe("#aaa");
      expect(result!.scoreBoxColor).toBe(DEFAULT_THEME.scoreBoxColor);
      expect(result!.clockBg).toBe("rgba(0,0,0,0.5)");
      expect(result!.clockColor).toBe(DEFAULT_THEME.clockColor);
    });
  });

  // ---- parseCustomPresets ----
  describe("parseCustomPresets", () => {
    it("returns undefined for null", () => {
      expect(parseCustomPresets(null)).toBeUndefined();
    });

    it("returns undefined for undefined", () => {
      expect(parseCustomPresets(undefined)).toBeUndefined();
    });

    it("returns undefined for non-object", () => {
      expect(parseCustomPresets("string")).toBeUndefined();
      expect(parseCustomPresets(123)).toBeUndefined();
    });

    it("returns undefined for empty object", () => {
      expect(parseCustomPresets({})).toBeUndefined();
    });

    it("parses a valid custom preset entry", () => {
      const data = {
        "preset-1": {
          name: "My Theme",
          theme: { scoreBoxBg: "#111" },
        },
      };
      const result = parseCustomPresets(data);
      expect(result).toBeDefined();
      expect(result!["preset-1"]).toBeDefined();
      expect(result!["preset-1"]!.name).toBe("My Theme");
      expect(result!["preset-1"]!.theme.scoreBoxBg).toBe("#111");
      // Missing theme keys should get DEFAULT_THEME values
      expect(result!["preset-1"]!.theme.clockBg).toBe(DEFAULT_THEME.clockBg);
    });

    it("uses the key as name when name is missing", () => {
      const data = {
        "my-key": {
          theme: { scoreBoxBg: "#222" },
        },
      };
      const result = parseCustomPresets(data);
      expect(result!["my-key"]!.name).toBe("my-key");
    });

    it("uses the key as name when name is non-string", () => {
      const data = {
        "key-1": {
          name: 42,
          theme: { scoreBoxBg: "#333" },
        },
      };
      const result = parseCustomPresets(data);
      expect(result!["key-1"]!.name).toBe("key-1");
    });

    it("skips entries with missing theme", () => {
      const data = {
        good: { name: "Good", theme: { scoreBoxBg: "#aaa" } },
        bad: { name: "Bad" }, // no theme → parseTheme returns undefined → skipped
      };
      const result = parseCustomPresets(data);
      expect(result).toBeDefined();
      expect(Object.keys(result!)).toEqual(["good"]);
    });

    it("skips entries with null/non-object theme", () => {
      const data = {
        a: { name: "A", theme: null },
        b: { name: "B", theme: "not an object" },
        c: { name: "C", theme: { scoreBoxBg: "#ccc" } },
      };
      const result = parseCustomPresets(data);
      expect(Object.keys(result!)).toEqual(["c"]);
    });

    it("skips non-object entries entirely", () => {
      const data = {
        good: { name: "Good", theme: {} },
        bad1: null,
        bad2: "string",
        bad3: 123,
      };
      const result = parseCustomPresets(data);
      expect(Object.keys(result!)).toEqual(["good"]);
    });

    it("includes basedOn when it is a string", () => {
      const data = {
        p1: {
          name: "Derived",
          theme: { scoreBoxBg: "#444" },
          basedOn: "Vikes Dark",
        },
      };
      const result = parseCustomPresets(data);
      expect(result!["p1"]!.basedOn).toBe("Vikes Dark");
    });

    it("omits basedOn when it is not a string", () => {
      const data = {
        p1: {
          name: "NoBased",
          theme: { scoreBoxBg: "#555" },
          basedOn: 42,
        },
      };
      const result = parseCustomPresets(data);
      expect(result!["p1"]!.basedOn).toBeUndefined();
    });

    it("returns undefined when all entries are invalid", () => {
      const data = {
        a: null,
        b: "string",
        c: { name: "NoTheme" },
      };
      expect(parseCustomPresets(data)).toBeUndefined();
    });

    it("parses multiple valid entries", () => {
      const data = {
        p1: { name: "First", theme: { scoreBoxBg: "#111" } },
        p2: { name: "Second", theme: { clockBg: "#222" } },
      };
      const result = parseCustomPresets(data);
      expect(Object.keys(result!)).toHaveLength(2);
      expect(result!["p1"]!.name).toBe("First");
      expect(result!["p2"]!.name).toBe("Second");
    });
  });
});
