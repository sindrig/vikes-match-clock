import { describe, it, expect } from "vitest";
import {
  parseLocations,
  parseMatch,
  parseController,
  parseView,
  parseTheme,
  parseCustomPresets,
  parseClubOverrides,
  parsePerimeterState,
  parsePerimeterPreview,
  parsePerimeterOverlay,
  parsePerimeterMediaPairs,
  parsePerimeterAdLayout,
  parsePerimeterAppliedAdLayout,
} from "./firebaseParsers";
import { Sports, DEFAULT_HALFSTOPS, DEFAULT_THEME } from "../constants";
import type {
  Match,
  ControllerState,
  ViewState,
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
  halftimeCountdown: false,
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

  // ---- parseClubOverrides ----
  describe("parseClubOverrides", () => {
    it("returns empty object for empty input", () => {
      expect(parseClubOverrides({})).toEqual({});
    });

    it("parses valid club override entry with all fields", () => {
      const data = {
        "uuid-1": {
          name: "Test FC",
          clubId: "1234",
          logoUrl: "https://example.com/logo.png",
          isOverride: false,
        },
      };
      const result = parseClubOverrides(data);
      expect(result).toEqual({
        "uuid-1": {
          name: "Test FC",
          clubId: "1234",
          logoUrl: "https://example.com/logo.png",
          isOverride: false,
        },
      });
    });

    it("skips entries missing logoUrl", () => {
      const data = {
        "uuid-1": {
          name: "Test",
          clubId: "1",
          isOverride: false,
        },
      };
      const result = parseClubOverrides(data);
      expect(result).toEqual({});
    });

    it("returns empty object for null input", () => {
      expect(parseClubOverrides(null)).toEqual({});
    });

    it("returns empty object for undefined input", () => {
      expect(parseClubOverrides(undefined)).toEqual({});
    });

    it("ignores extra fields and preserves valid fields", () => {
      const data = {
        "uuid-1": {
          name: "Test FC",
          clubId: "1234",
          logoUrl: "https://example.com/logo.png",
          isOverride: false,
          extraField: "should be ignored",
          anotherExtra: 123,
        },
      };
      const result = parseClubOverrides(data);
      expect(result).toEqual({
        "uuid-1": {
          name: "Test FC",
          clubId: "1234",
          logoUrl: "https://example.com/logo.png",
          isOverride: false,
        },
      });
      expect(result["uuid-1"]).not.toHaveProperty("extraField");
      expect(result["uuid-1"]).not.toHaveProperty("anotherExtra");
    });

    it("preserves isOverride: true flag", () => {
      const data = {
        "uuid-1": {
          name: "Bundled Club",
          clubId: "2492",
          logoUrl: "https://example.com/logo.png",
          isOverride: true,
        },
      };
      const result = parseClubOverrides(data);
      expect(result["uuid-1"]!.isOverride).toBe(true);
    });
  });

  describe("parsePerimeterState", () => {
    it("returns undefined for null input", () => {
      expect(parsePerimeterState(null)).toBeUndefined();
    });

    it("returns undefined for undefined input", () => {
      expect(parsePerimeterState(undefined)).toBeUndefined();
    });

    it("returns undefined for non-object input", () => {
      expect(parsePerimeterState("on")).toBeUndefined();
      expect(parsePerimeterState(123)).toBeUndefined();
      expect(parsePerimeterState(true)).toBeUndefined();
    });

    it("parses enabled and state together", () => {
      const result = parsePerimeterState({ enabled: true, state: "on" });
      expect(result).toEqual({ enabled: true, state: "on" });
    });

    it("parses off state", () => {
      const result = parsePerimeterState({ enabled: true, state: "off" });
      expect(result).toEqual({ enabled: true, state: "off" });
    });

    it("defaults to disabled and off for an empty object", () => {
      expect(parsePerimeterState({})).toEqual({
        enabled: false,
        state: "off",
      });
    });

    it("does not preserve enabled when it is not a boolean", () => {
      expect(parsePerimeterState({ enabled: "yes", state: "on" })).toEqual({
        enabled: false,
        state: "on",
      });
    });

    it("does not preserve state when it is not on or off", () => {
      expect(parsePerimeterState({ enabled: true, state: "paused" })).toEqual({
        enabled: true,
        state: "off",
      });
      expect(parsePerimeterState({ enabled: true, state: 1 })).toEqual({
        enabled: true,
        state: "off",
      });
    });
  });

  describe("parsePerimeterPreview", () => {
    it("returns undefined for null or non-object input", () => {
      expect(parsePerimeterPreview(null)).toBeUndefined();
      expect(parsePerimeterPreview(undefined)).toBeUndefined();
      expect(parsePerimeterPreview("x")).toBeUndefined();
      expect(parsePerimeterPreview(12)).toBeUndefined();
    });

    it("parses columns, clips, filenames and thumbnails", () => {
      const result = parsePerimeterPreview({
        updatedAt: 1723392000000,
        columns: [
          {
            id: 1,
            name: "Column 1",
            clips: [
              {
                id: 12,
                filename: "sponsor-loop.mp4",
                thumbnail: "data:image/jpeg;base64,abc",
              },
              { id: 13, filename: "logo.png" },
            ],
          },
        ],
      });
      expect(result).toEqual({
        updatedAt: 1723392000000,
        columns: [
          {
            id: 1,
            name: "Column 1",
            clips: [
              {
                id: 12,
                filename: "sponsor-loop.mp4",
                thumbnail: "data:image/jpeg;base64,abc",
              },
              { id: 13, filename: "logo.png", thumbnail: undefined },
            ],
          },
        ],
      });
    });

    it("treats a missing updatedAt as null", () => {
      expect(parsePerimeterPreview({ columns: [] })).toEqual({
        updatedAt: null,
        columns: [],
      });
    });

    it("drops clips without a filename and columns without a name", () => {
      const result = parsePerimeterPreview({
        columns: [
          { id: 1, name: "Column 1", clips: [{ id: 2 }] },
          { id: 3, name: "", clips: [{ id: 4, filename: "x.mp4" }] },
          { id: 5, name: "Column 3", clips: null },
        ],
      });
      expect(result).toEqual({
        updatedAt: null,
        columns: [
          { id: 1, name: "Column 1", clips: [] },
          { id: 5, name: "Column 3", clips: [] },
        ],
      });
    });

    it("ignores malformed column and clip entries", () => {
      const result = parsePerimeterPreview({
        columns: [
          "junk",
          {
            id: 1,
            name: "Column 1",
            clips: [{ id: 2, filename: "a.mp4" }, null, "junk"],
          },
        ],
      });
      expect(result!.columns).toHaveLength(1);
      expect(result!.columns[0].clips).toHaveLength(1);
      expect(result!.columns[0].clips[0].filename).toBe("a.mp4");
    });

    it("falls back to null ids when a numeric id is missing", () => {
      const result = parsePerimeterPreview({
        columns: [{ name: "Column 1", clips: [{ filename: "a.mp4" }] }],
      });
      expect(result!.columns[0].id).toBeNull();
      expect(result!.columns[0].clips[0].id).toBeNull();
    });
  });

  describe("parsePerimeterAdLayout", () => {
    const validLayout = {
      version: 1,
      revision: "abc-123",
      columns: [
        {
          id: "col-1",
          files: {
            "2": {
              name: "ad-48.png",
              source:
                "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/ad-48.png",
            },
          },
        },
      ],
    };

    it("parses a valid layout", () => {
      const result = parsePerimeterAdLayout(validLayout);
      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
      expect(result!.revision).toBe("abc-123");
      expect(result!.columns).toHaveLength(1);
      expect(result!.columns[0]?.id).toBe("col-1");
    });

    it("returns null for null input", () => {
      expect(parsePerimeterAdLayout(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(parsePerimeterAdLayout(undefined)).toBeNull();
    });

    it("returns null for wrong version", () => {
      expect(parsePerimeterAdLayout({ ...validLayout, version: 2 })).toBeNull();
      expect(parsePerimeterAdLayout({ ...validLayout, version: 0 })).toBeNull();
    });

    it("returns null for missing revision", () => {
      expect(
        parsePerimeterAdLayout({ ...validLayout, revision: "" }),
      ).toBeNull();
      expect(
        parsePerimeterAdLayout({ ...validLayout, revision: 123 }),
      ).toBeNull();
    });

    it("returns null when columns exceed 20", () => {
      const manyColumns = Array.from({ length: 21 }, (_, i) => ({
        id: `col-${i}`,
        files: {
          "2": {
            name: "ad.png",
            source:
              "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/ad.png",
          },
        },
      }));
      expect(
        parsePerimeterAdLayout({ ...validLayout, columns: manyColumns }),
      ).toBeNull();
    });

    it("returns null for duplicate column ids", () => {
      const dupeColumns = [
        {
          id: "same-id",
          files: {
            "2": {
              name: "a.png",
              source:
                "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/a.png",
            },
          },
        },
        {
          id: "same-id",
          files: {
            "2": {
              name: "b.png",
              source:
                "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/b.png",
            },
          },
        },
      ];
      expect(
        parsePerimeterAdLayout({ ...validLayout, columns: dupeColumns }),
      ).toBeNull();
    });

    it("returns null for invalid filename '..'", () => {
      const bad = {
        ...validLayout,
        columns: [
          {
            id: "col-1",
            files: {
              "2": {
                name: "..",
                source:
                  "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/..",
              },
            },
          },
        ],
      };
      expect(parsePerimeterAdLayout(bad)).toBeNull();
    });

    it("returns null for filename with colon (Windows-invalid)", () => {
      const bad = {
        ...validLayout,
        columns: [
          {
            id: "col-1",
            files: {
              "2": {
                name: "a:b.png",
                source:
                  "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/a:b.png",
              },
            },
          },
        ],
      };
      expect(parsePerimeterAdLayout(bad)).toBeNull();
    });

    it("returns null for source with wrong bucket", () => {
      const bad = {
        ...validLayout,
        columns: [
          {
            id: "col-1",
            files: {
              "2": {
                name: "ad.png",
                source: "gs://wrong-bucket.appspot.com/vikuti/perimeter/ad.png",
              },
            },
          },
        ],
      };
      expect(parsePerimeterAdLayout(bad)).toBeNull();
    });

    it("returns null when source is not under location prefix", () => {
      const bad = {
        ...validLayout,
        columns: [
          {
            id: "col-1",
            files: {
              "2": {
                name: "ad.png",
                source:
                  "gs://vikes-match-clock-firebase.appspot.com/other-location/perimeter/ad.png",
              },
            },
          },
        ],
      };
      expect(parsePerimeterAdLayout(bad, { location: "vikuti" })).toBeNull();
    });

    it("accepts valid source under location prefix", () => {
      const result = parsePerimeterAdLayout(validLayout, {
        location: "vikuti",
      });
      expect(result).not.toBeNull();
      expect(result!.columns).toHaveLength(1);
    });

    it("accepts a custom bucket override", () => {
      const stagingLayout = {
        ...validLayout,
        columns: [
          {
            id: "col-1",
            files: {
              "2": {
                name: "ad.png",
                source:
                  "gs://vikes-match-clock-staging.appspot.com/vikuti/perimeter/ad.png",
              },
            },
          },
        ],
      };
      const result = parsePerimeterAdLayout(stagingLayout, {
        location: "vikuti",
        bucket: "vikes-match-clock-staging.appspot.com",
      });
      expect(result).not.toBeNull();
    });

    it("returns null for Windows reserved device name", () => {
      const bad = {
        ...validLayout,
        columns: [
          {
            id: "col-1",
            files: {
              "2": {
                name: "CON",
                source:
                  "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/CON",
              },
            },
          },
        ],
      };
      expect(parsePerimeterAdLayout(bad)).toBeNull();
    });

    it("returns null for trailing dot in filename", () => {
      const bad = {
        ...validLayout,
        columns: [
          {
            id: "col-1",
            files: {
              "2": {
                name: "ad.png.",
                source:
                  "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/ad.png.",
              },
            },
          },
        ],
      };
      expect(parsePerimeterAdLayout(bad)).toBeNull();
    });

    it("accepts the same Storage object reused across lanes", () => {
      const shared = {
        ...validLayout,
        columns: [
          {
            id: "col-1",
            files: {
              "2": {
                name: "ad.png",
                source:
                  "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/ad.png",
              },
              "4": {
                name: "ad.png",
                source:
                  "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/ad.png",
              },
            },
          },
        ],
      };
      expect(parsePerimeterAdLayout(shared)).not.toBeNull();
    });

    it("returns null when the same filename maps to two different sources", () => {
      const clash = {
        ...validLayout,
        columns: [
          {
            id: "col-1",
            files: {
              "2": {
                name: "ad.png",
                source:
                  "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/ad.png",
              },
              "4": {
                name: "ad.png",
                source:
                  "gs://vikes-match-clock-firebase.appspot.com/vikuti/perimeter/ad-other.png",
              },
            },
          },
        ],
      };
      expect(parsePerimeterAdLayout(clash)).toBeNull();
    });
  });

  describe("parsePerimeterAppliedAdLayout", () => {
    const validApplied = {
      lanes: [
        { id: "1", name: "48 skjair" },
        { id: "3", name: "40 skjair" },
      ],
      revision: "rev-abc",
      phase: "playing",
      error: null,
      updatedAt: 1723392000000,
      columns: [
        {
          id: "col-1",
          deckColumns: [1, 2, 3],
          files: {
            "1": {
              name: "ad-48.png",
              thumbnail: "data:image/png;base64,abc",
            },
            "3": {
              name: "ad-40.mp4",
            },
          },
        },
      ],
    };

    it("parses a valid applied layout", () => {
      const result = parsePerimeterAppliedAdLayout(validApplied);
      expect(result).toBeDefined();
      expect(result!.revision).toBe("rev-abc");
      expect(result!.phase).toBe("playing");
      expect(result!.lanes).toHaveLength(2);
      expect(result!.columns).toHaveLength(1);
      expect(result!.columns[0]?.deckColumns).toEqual([1, 2, 3]);
    });

    it("returns undefined for non-object input", () => {
      expect(parsePerimeterAppliedAdLayout(null)).toBeUndefined();
      expect(parsePerimeterAppliedAdLayout("string")).toBeUndefined();
      expect(parsePerimeterAppliedAdLayout(123)).toBeUndefined();
    });

    it("defaults invalid phase to idle", () => {
      const result = parsePerimeterAppliedAdLayout({
        ...validApplied,
        phase: "invalid-phase",
      });
      expect(result!.phase).toBe("idle");
    });

    it("defaults missing phase to idle", () => {
      const noPhase = { ...validApplied };
      delete (noPhase as Record<string, unknown>).phase;
      const result = parsePerimeterAppliedAdLayout(noPhase);
      expect(result!.phase).toBe("idle");
    });

    it("defaults a legacy staging phase to idle", () => {
      const result = parsePerimeterAppliedAdLayout({
        ...validApplied,
        phase: "staging",
      });
      expect(result!.phase).toBe("idle");
    });

    it("uses Date.now() when updatedAt is missing", () => {
      const noTimestamp = { ...validApplied };
      delete (noTimestamp as Record<string, unknown>).updatedAt;
      const before = Date.now();
      const result = parsePerimeterAppliedAdLayout(noTimestamp);
      const after = Date.now();
      expect(result!.updatedAt).toBeGreaterThanOrEqual(before);
      expect(result!.updatedAt).toBeLessThanOrEqual(after);
    });

    it("parses deckColumns and filters invalid entries", () => {
      const result = parsePerimeterAppliedAdLayout({
        ...validApplied,
        columns: [
          {
            id: "col-1",
            deckColumns: [1, 2, -3, 0, 4.5, 5],
            files: {
              "1": { name: "ad-48.png" },
            },
          },
        ],
      });
      expect(result!.columns[0]?.deckColumns).toEqual([1, 2, 5]);
    });

    it("defaults to an empty deckColumns array when absent", () => {
      const noDeck = { ...validApplied };
      delete (noDeck.columns[0] as Record<string, unknown>).deckColumns;
      const result = parsePerimeterAppliedAdLayout(noDeck);
      expect(result!.columns[0]?.deckColumns).toEqual([]);
    });

    it("drops columns with invalid filenames", () => {
      const badApplied = {
        ...validApplied,
        columns: [
          {
            id: "col-bad",
            deckColumns: [1],
            files: {
              "1": {
                name: "..",
              },
            },
          },
        ],
      };
      const result = parsePerimeterAppliedAdLayout(badApplied);
      expect(result!.columns).toHaveLength(0);
    });

    it("preserves lanes with valid id and name", () => {
      const result = parsePerimeterAppliedAdLayout(validApplied);
      expect(result!.lanes[0]).toEqual({ id: "1", name: "48 skjair" });
    });

    it("drops lanes with missing id or name", () => {
      const withBadLanes = {
        ...validApplied,
        lanes: [
          { id: "1", name: "Good" },
          { id: "", name: "No Id" },
          { id: "3", name: "" },
          null,
        ],
      };
      const result = parsePerimeterAppliedAdLayout(withBadLanes);
      expect(result!.lanes).toHaveLength(1);
      expect(result!.lanes[0]?.id).toBe("1");
    });
  });

  describe("parsePerimeterOverlay", () => {
    const bucket = "vikes-match-clock-firebase.appspot.com";
    const goalOverlay = {
      version: 1,
      id: "goal-1",
      columns: [
        {
          durationMs: 10000,
          files: {
            "2": {
              name: "goal-48.mp4",
              source: `gs://${bucket}/vikuti/perimeter/goal-48.mp4`,
            },
            "4": {
              name: "goal-40.mp4",
              source: `gs://${bucket}/vikuti/perimeter/goal-40.mp4`,
            },
          },
        },
      ],
    };

    it("accepts legacy home-goal files under {location}/perimeter/", () => {
      const result = parsePerimeterOverlay(goalOverlay, {
        location: "vikuti",
      });
      expect(result).not.toBeNull();
      expect(result?.columns[0]?.files["2"]?.name).toBe("goal-48.mp4");
    });

    it("accepts named media-pair files under {location}/perimeter-overlays/", () => {
      const pairId = "11111111-1111-4111-8111-111111111111";
      const overlay = {
        version: 1,
        id: "pair-1",
        columns: [
          {
            durationMs: 10000,
            files: {
              "2": {
                name: "48-1-sindri.mp4",
                source: `gs://${bucket}/vikuti/perimeter-overlays/${pairId}/48/48-1-sindri.mp4`,
              },
              "4": {
                name: "40-1-sindri.png",
                source: `gs://${bucket}/vikuti/perimeter-overlays/${pairId}/40/40-1-sindri.png`,
              },
            },
          },
        ],
      };
      const result = parsePerimeterOverlay(overlay, { location: "vikuti" });
      expect(result).not.toBeNull();
    });

    it("rejects sources outside the two allowed location prefixes", () => {
      const overlay = {
        version: 1,
        id: "bad-1",
        columns: [
          {
            durationMs: 10000,
            files: {
              "2": {
                name: "x.mp4",
                source: `gs://${bucket}/vikuti/elsewhere/x.mp4`,
              },
            },
          },
        ],
      };
      expect(parsePerimeterOverlay(overlay, { location: "vikuti" })).toBeNull();
    });

    it("rejects sources from a foreign location", () => {
      const overlay = {
        version: 1,
        id: "bad-1",
        columns: [
          {
            durationMs: 10000,
            files: {
              "2": {
                name: "goal-48.mp4",
                source: `gs://${bucket}/other/perimeter/goal-48.mp4`,
              },
            },
          },
        ],
      };
      expect(parsePerimeterOverlay(overlay, { location: "vikuti" })).toBeNull();
    });
  });

  describe("parsePerimeterMediaPairs", () => {
    const bucket = "vikes-match-clock-firebase.appspot.com";
    const location = "vikuti";
    const pairId = "11111111-1111-4111-8111-111111111111";
    const validPair = () => ({
      [pairId]: {
        name: "Sindri",
        files: {
          "2": {
            name: "48-1-sindri.mp4",
            source: `gs://${bucket}/${location}/perimeter-overlays/${pairId}/48/48-1-sindri.mp4`,
          },
          "4": {
            name: "40-1-sindri.png",
            source: `gs://${bucket}/${location}/perimeter-overlays/${pairId}/40/40-1-sindri.png`,
          },
        },
      },
    });

    it("accepts a valid pair with exact target-specific paths", () => {
      const result = parsePerimeterMediaPairs(validPair(), {
        location,
        bucket,
      });
      expect(Object.keys(result)).toHaveLength(1);
      expect(result[pairId]?.name).toBe("Sindri");
      expect(result[pairId]?.files["2"]?.name).toBe("48-1-sindri.mp4");
      expect(result[pairId]?.files["4"]?.name).toBe("40-1-sindri.png");
    });

    it("returns an empty map for null/undefined/primitive input", () => {
      expect(parsePerimeterMediaPairs(null)).toEqual({});
      expect(parsePerimeterMediaPairs(undefined)).toEqual({});
      expect(parsePerimeterMediaPairs("x")).toEqual({});
    });

    it("rejects a pair missing a target", () => {
      const data = validPair();
      delete (data[pairId] as { files: Record<string, unknown> }).files["4"];
      const result = parsePerimeterMediaPairs(data, { location, bucket });
      expect(result).toEqual({});
    });

    it("rejects a pair with an extra target", () => {
      const data = validPair();
      const files = (data[pairId] as { files: Record<string, unknown> }).files;
      files["5"] = {
        name: "x.mp4",
        source: `gs://${bucket}/${location}/perimeter-overlays/${pairId}/48/x.mp4`,
      };
      const result = parsePerimeterMediaPairs(data, { location, bucket });
      expect(result).toEqual({});
    });

    it("rejects a pair with an invalid (empty/too long) name", () => {
      const empty = validPair();
      (empty[pairId] as { name: string }).name = "   ";
      expect(parsePerimeterMediaPairs(empty, { location, bucket })).toEqual({});

      const long = validPair();
      (long[pairId] as { name: string }).name = "x".repeat(81);
      expect(parsePerimeterMediaPairs(long, { location, bucket })).toEqual({});
    });

    it("rejects an unsafe filename", () => {
      const data = validPair();
      (data[pairId] as { files: Record<string, { name: string }> }).files[
        "2"
      ].name = "../evil.mp4";
      expect(parsePerimeterMediaPairs(data, { location, bucket })).toEqual({});
    });

    it("rejects a wrong bucket", () => {
      const data = validPair();
      (data[pairId] as { files: Record<string, { source: string }> }).files[
        "2"
      ].source =
        `gs://wrong.appspot.com/${location}/perimeter-overlays/${pairId}/48/a.mp4`;
      expect(parsePerimeterMediaPairs(data, { location, bucket })).toEqual({});
    });

    it("rejects a wrong location", () => {
      const data = validPair();
      (data[pairId] as { files: Record<string, { source: string }> }).files[
        "2"
      ].source = `gs://${bucket}/other/perimeter-overlays/${pairId}/48/a.mp4`;
      expect(parsePerimeterMediaPairs(data, { location, bucket })).toEqual({});
    });

    it("rejects a 48/40 path/layer mismatch", () => {
      const data = validPair();
      // Layer "2" must point at the /48/ folder; /40/ is invalid here.
      (data[pairId] as { files: Record<string, { source: string }> }).files[
        "2"
      ].source =
        `gs://${bucket}/${location}/perimeter-overlays/${pairId}/40/a.mp4`;
      expect(parsePerimeterMediaPairs(data, { location, bucket })).toEqual({});
    });

    it("rejects an invalid pair ID key", () => {
      const data: Record<string, unknown> = {
        "not-a-uuid": {
          name: "Sindri",
          files: {
            "2": {
              name: "48-1-sindri.mp4",
              source: `gs://${bucket}/${location}/perimeter-overlays/not-a-uuid/48/48-1-sindri.mp4`,
            },
            "4": {
              name: "40-1-sindri.png",
              source: `gs://${bucket}/${location}/perimeter-overlays/not-a-uuid/40/40-1-sindri.png`,
            },
          },
        },
      };
      expect(parsePerimeterMediaPairs(data, { location, bucket })).toEqual({});
    });

    it("rejects a pair whose source pairId does not match its key", () => {
      const otherId = "22222222-2222-4222-8222-222222222222";
      const data = validPair();
      (data[pairId] as { files: Record<string, { source: string }> }).files[
        "2"
      ].source =
        `gs://${bucket}/${location}/perimeter-overlays/${otherId}/48/a.mp4`;
      expect(parsePerimeterMediaPairs(data, { location, bucket })).toEqual({});
    });

    it("drops malformed entries without breaking valid ones", () => {
      const data = {
        ...validPair(),
        broken: { name: "Broken", files: {} },
        "22222222-2222-4222-8222-222222222222": {
          name: "Góð",
          files: {
            "2": {
              name: "48-2-good.mp4",
              source: `gs://${bucket}/${location}/perimeter-overlays/22222222-2222-4222-8222-222222222222/48/48-2-good.mp4`,
            },
            "4": {
              name: "40-2-good.png",
              source: `gs://${bucket}/${location}/perimeter-overlays/22222222-2222-4222-8222-222222222222/40/40-2-good.png`,
            },
          },
        },
      };
      const result = parsePerimeterMediaPairs(data, { location, bucket });
      expect(Object.keys(result)).toHaveLength(2);
      expect(result["22222222-2222-4222-8222-222222222222"]?.name).toBe("Góð");
      expect(result.broken).toBeUndefined();
    });
  });
});
