import { describe, expect, it, vi } from "vitest";

import { storageHelpers } from "../firebase";
import {
  getMOTMAsset,
  getPlayerAssetObject,
} from "../controller/asset/team/assetHelpers";
import { deriveBandRequest } from "../perimeter/bandDerivation";
import {
  parseAsset,
  parseController,
  parseCurrentAsset,
  parsePlayer,
  parseRoster,
  parseTwoMinPenalty,
  parseViewPort,
} from "./firebaseParsers";
import {
  parseAssetCollection,
  parsePenaltyCollection,
  playerChildKey,
} from "./nestedParsers";
import type { ControllerState } from "../types";

const card = {
  type: "PLAYER",
  key: "https://media.example.test/7.png",
  name: "Jón",
  fullName: "Jón Jónsson",
  number: "07",
  teamName: "Víkingur R",
  overlay: { text: "MARK!", blink: true, effect: "flash", locale: "is" },
  background: "https://media.example.test/background.MP4",
  isGoalCelebration: false,
  metadata: { importedAt: 17, source: ["archive", "manual"] },
};
const assets = [
  { type: "IMAGE", key: "https://media.example.test/old.gif" },
  {
    type: "VIDEO",
    key: "vikin/images/sponsor.mp4",
    url: "https://media.example.test/sponsor.mp4?token=old",
    name: "Sponsor.mp4",
    loop: true,
    generation: "1700000000000000",
  },
  { type: "URL", key: "https://www.youtube.com/watch?v=fixture", name: "Clip" },
  card,
  {
    ...card,
    type: "NO_IMAGE_PLAYER",
    key: "custom-no-number-Coach",
    number: undefined,
    role: "Þjálfari",
  },
  { ...card, type: "MOTM", originalAssetType: "PLAYER" },
  { ...card, type: "MOTM", originalAssetType: "NO_IMAGE_PLAYER" },
  {
    type: "SUB",
    key: "sub-on-off",
    subIn: card,
    subOut: { ...card, key: "off.png", fullName: "Óli" },
    operatorNote: { checked: true },
  },
];
const defaults: ControllerState = {
  queues: {},
  activeQueueId: null,
  playing: false,
  assetView: "assets",
  view: "idle",
  roster: { home: [], away: [] },
  currentAsset: null,
  refreshToken: "",
};

describe("canonical nested structures and supported legacy round trips", () => {
  it.each(assets)(
    "retains the producer's $type payload and metadata",
    (asset) => {
      // JSON/RTDB omits optional undefined children. Reads of old records do not
      // generate playback IDs or rewrite reusable media identity.
      const stored: unknown = JSON.parse(JSON.stringify(asset));
      expect(parseAsset(stored)).toEqual(stored);
      const current = { asset: stored, operator: { label: "saved" } };
      const first = parseCurrentAsset(current);
      expect(first).toEqual({ ...current, time: null });
      expect(parseCurrentAsset(first)).toEqual(first);
      expect(Object.prototype.hasOwnProperty.call(first, "occurrenceId")).toBe(
        false,
      );
    },
  );

  it.each([
    null,
    [],
    "IMAGE",
    1,
    {},
    { key: "x", type: "image" },
    { key: {}, type: "IMAGE" },
    { key: "x", type: ["VIDEO"] },
    { ...card, url: [] },
    { ...card, background: 17 },
    { ...card, loop: "false" },
    { ...card, name: {} },
    { ...card, fullName: false },
    { ...card, teamName: ["Víkingur R"] },
    { ...card, role: {} },
    { ...card, number: Infinity },
    { ...card, number: { number: 7 } },
    { ...card, isGoalCelebration: "true" },
    { ...card, overlay: [] },
    { ...card, overlay: { text: {} } },
    { ...card, overlay: { text: "Goal", blink: "true" } },
    { ...card, overlay: { text: "Goal", effect: {} } },
    { ...card, type: "MOTM", originalAssetType: "SUB" },
    { type: "SUB", key: "sub", subIn: card },
    {
      type: "SUB",
      key: "sub",
      subIn: card,
      subOut: { type: "IMAGE", key: "bad" },
    },
    {
      type: "SUB",
      key: "sub",
      subIn: { ...card, overlay: { text: [] } },
      subOut: card,
    },
  ])(
    "rejects a malformed entry without trusting its discriminator: %j",
    (raw) => {
      expect(parseAsset(raw)).toBeNull();
      expect(parseCurrentAsset({ asset: raw, time: 1 })).toBeNull();
      expect(parseAssetCollection([assets[0], raw, assets[1]])).toEqual([
        assets[0],
        assets[1],
      ]);
    },
  );

  it("does not traverse a nested SUB chain", () => {
    let raw: unknown = card;
    for (let i = 0; i < 5000; i += 1)
      raw = { type: "SUB", key: `sub-${i}`, subIn: raw, subOut: card };
    expect(parseAsset(raw)).toBeNull();
  });

  it.each([
    [assets[0], null, { ...card, name: {} }, assets[1]],
    { 0: assets[0], 9: null, 20: { ...card, name: {} }, 100: assets[1] },
    { first: assets[0], corrupt: false, last: assets[1] },
  ])(
    "retains ordered valid assets in mixed Firebase collections: %j",
    (items) => {
      const parsed = parseController(
        {
          queues: {
            q: { items, annotation: { source: "saved" } },
            corrupt: [],
          },
        },
        defaults,
      )!;
      expect(parsed.queues.q?.items).toEqual([assets[0], assets[1]]);
      expect(parsed.queues.q?.annotation).toEqual({ source: "saved" });
      expect(parsed.queues.corrupt).toBeUndefined();
    },
  );

  it("normalizes nullable card fields without applying band presentation limits", () => {
    const raw = {
      type: "NO_IMAGE_PLAYER",
      key: "custom",
      name: null,
      number: null,
      role: null,
      fullName: null,
      background: null,
      teamName: null,
      loop: null,
      isGoalCelebration: null,
      url: null,
      overlay: null,
      imported: { edition: 2 },
    };
    expect(parseAsset(raw)).toEqual({
      type: "NO_IMAGE_PLAYER",
      key: "custom",
      overlay: null,
      imported: { edition: 2 },
    });
    const foreign = {
      ...card,
      name: "李 明".repeat(90),
      fullName: "",
      number: "A7",
    };
    expect(parseAsset(foreign)).toEqual(foreign);
    expect(deriveBandRequest({ asset: foreign })).toBeNull();
  });

  it.each([
    { name: "", number: "", role: "", show: false },
    { name: "#22", id: 0, number: 22, show: false },
    { name: "Coach", id: 31, role: "Þjálfari" },
    {
      name: "李 明",
      id: "foreign-7",
      number: "A7",
      custom: { text: "coach note" },
    },
  ])("retains editable, placeholder, coach and foreign players: %j", (raw) => {
    expect(parsePlayer(raw)).toEqual(raw);
  });

  it("normalizes nulls and unnamed players rather than rejecting a roster", () => {
    expect(
      parsePlayer({
        name: null,
        id: null,
        number: "0",
        role: null,
        show: null,
      }),
    ).toEqual({ name: "", number: "0" });
    expect(parsePlayer({ id: 5, number: 0 })).toEqual({
      name: "",
      id: 5,
      number: 0,
    });
  });

  it.each([
    null,
    [],
    {},
    false,
    { name: {} },
    { name: "Jón", id: {} },
    { name: "Jón", number: true },
    { name: "Jón", show: "true" },
    { name: "Jón", role: [] },
    { name: "Jón", id: NaN },
  ])("discards only an invalid roster entry: %j", (invalid) => {
    const good = {
      name: "Coach",
      id: 1,
      role: "Þjálfari",
      note: { source: "legacy" },
    };
    const roster = parseRoster({
      home: { 7: invalid, 10: good },
      away: [good, invalid],
    });
    expect(roster).toEqual({ home: [good], away: [good] });
    expect(playerChildKey(roster.home, 0)).toBe("10");
    expect(playerChildKey(roster.away, 0)).toBe("0");
    expect(JSON.parse(JSON.stringify(roster))).toEqual(roster);
  });

  it("keeps finite penalty creation data and metadata, without coercion", () => {
    const penalty = {
      key: "p",
      atTimeElapsed: 0,
      penaltyLength: 120000,
      note: { reason: "test" },
    };
    expect(parseTwoMinPenalty(penalty)).toEqual(penalty);
    expect(
      parsePenaltyCollection({
        5: penalty,
        9: { ...penalty, atTimeElapsed: "0" },
        10: { ...penalty, penaltyLength: false },
        11: { ...penalty, key: {} },
        12: { ...penalty, penaltyLength: NaN },
        19: { ...penalty, key: "second" },
      }),
    ).toEqual([penalty, { ...penalty, key: "second" }]);
  });

  it("normalizes viewport variants and preserves editable metadata", () => {
    const fallback = {
      key: "main",
      name: "Main",
      style: { width: 512, height: 400 },
    };
    expect(
      parseViewPort(
        {
          key: "insidebig",
          name: "Indoor",
          fontSize: "200%",
          style: {
            width: "1920",
            height: "1080",
            color: "red",
            calibration: { revision: 2 },
          },
          note: "kept",
        },
        fallback,
      ),
    ).toEqual({
      key: "insidebig",
      name: "Indoor",
      fontSize: "200%",
      style: {
        width: 1920,
        height: 1080,
        color: "red",
        calibration: { revision: 2 },
      },
      note: "kept",
    });
    expect(
      parseViewPort(
        {
          key: [],
          name: {},
          fontSize: [],
          style: { width: Infinity, height: -1 },
        },
        fallback,
      ),
    ).toEqual(fallback);
  });

  it.each([null, undefined, "", " ", {}, false, 7, "x".repeat(129)])(
    "never downgrades a malformed present occurrence ID to legacy: %j",
    (occurrenceId) => {
      expect(parseCurrentAsset({ asset: assets[0], occurrenceId })).toBeNull();
    },
  );

  it("keeps occurrence absence distinct and duration normalization deterministic", () => {
    const generateId = vi.spyOn(crypto, "randomUUID");
    try {
      for (const time of [undefined, null, 0, 3]) {
        const raw = {
          asset: assets[1],
          time,
          occurrenceId: "same_occurrence",
          note: ["kept"],
        };
        expect(parseCurrentAsset(raw)).toEqual({ ...raw, time: time ?? null });
        expect(parseCurrentAsset(raw)).toEqual(parseCurrentAsset(raw));
      }
      expect(generateId).not.toHaveBeenCalled();
    } finally {
      generateId.mockRestore();
    }
  });

  it("round-trips actual coach/photo, missing-photo and MOTM producer results", async () => {
    const player = parsePlayer({
      name: "Coach",
      id: "foreign-coach",
      number: null,
      role: "Þjálfari",
    })!;
    const photo = await getPlayerAssetObject({
      listenPrefix: "test",
      player,
      teamName: "Foreign FC",
    });
    expect(photo?.type).toBe("PLAYER");
    expect(parseAsset(photo)).toEqual(photo);
    expect(Object.prototype.hasOwnProperty.call(photo, "number")).toBe(false);
    vi.spyOn(storageHelpers, "getDownloadURL").mockRejectedValueOnce(
      new Error("missing photo"),
    );
    const fallback = await getPlayerAssetObject({
      listenPrefix: "test",
      player,
      teamName: "Foreign FC",
    });
    expect(fallback?.type).toBe("NO_IMAGE_PLAYER");
    expect(parseAsset(fallback)).toEqual(fallback);
    const motm = await getMOTMAsset({
      listenPrefix: "test",
      player,
      teamName: "Foreign FC",
    });
    expect(motm?.originalAssetType).toBe("PLAYER");
    expect(parseAsset(motm)).toEqual(motm);
  });
});
