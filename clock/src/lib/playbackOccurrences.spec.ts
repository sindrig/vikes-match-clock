import { describe, expect, it } from "vitest";
import { parseCurrentAsset } from "../contexts/firebaseParsers";
import type { ControllerState } from "../types";
import { timedAssetCompletionPrecondition } from "./conditionalTransitions";

const state: ControllerState = {
  queues: {},
  activeQueueId: "q",
  playing: true,
  assetView: "assets",
  view: "idle",
  roster: { home: [], away: [] },
  currentAsset: null,
  refreshToken: "",
};
const observation = {
  assetKey: "A",
  time: 3,
  activeQueueId: "q",
  playing: true,
  occurrenceId: "first-A",
};

describe("playback occurrence safety", () => {
  it("rejects first-A completion against second-A despite the identical tuple", () => {
    const secondA = {
      ...state,
      currentAsset: {
        asset: { key: "A", type: "IMAGE" },
        time: 3,
        occurrenceId: "second-A",
      },
    };
    expect(
      timedAssetCompletionPrecondition(observation)(secondA, secondA),
    ).toBe(false);
  });
  it("accepts only explicit legacy observations against a truly absent raw field", () => {
    const legacy = {
      ...state,
      currentAsset: { asset: { key: "A", type: "IMAGE" }, time: 3 },
    };
    const check = timedAssetCompletionPrecondition({
      ...observation,
      occurrenceId: null,
    });
    expect(check(legacy, legacy)).toBe(true);
    expect(
      check(legacy, {
        ...legacy,
        currentAsset: { ...legacy.currentAsset, occurrenceId: "second-A" },
      }),
    ).toBe(false);
    expect(
      timedAssetCompletionPrecondition({
        ...observation,
        occurrenceId: undefined as unknown as string,
      })(legacy, legacy),
    ).toBe(false);
  });

  it.each([null, undefined, "", " ", 0, false, {}, [], "x".repeat(129)])(
    "rejects malformed present IDs in both parsing and raw CAS (%j)",
    (occurrenceId) => {
      const rawAsset = {
        asset: { key: "A", type: "IMAGE" },
        time: 3,
        occurrenceId,
      };
      expect(parseCurrentAsset(rawAsset)).toBeNull();
      // Even a caller that accidentally supplied a normalized legacy object
      // cannot hide the malformed authoritative raw field from the CAS guard.
      const normalized = {
        ...state,
        currentAsset: { asset: rawAsset.asset, time: 3 },
      };
      expect(
        timedAssetCompletionPrecondition({
          ...observation,
          occurrenceId: null,
        })(normalized, { ...state, currentAsset: rawAsset }),
      ).toBe(false);
    },
  );

  it("parses the same persisted legacy state deterministically without generating IDs", () => {
    const raw = { asset: { key: "A", type: "IMAGE", loop: true } };
    expect(parseCurrentAsset(raw)).toEqual({ asset: raw.asset, time: null });
    expect(parseCurrentAsset(raw)).toEqual(parseCurrentAsset(raw));
    expect(raw).not.toHaveProperty("occurrenceId");
  });

  it("does not use subscription defaults to fabricate a matching raw queue or playing flag", () => {
    const legacy = {
      ...state,
      currentAsset: { asset: { key: "A", type: "IMAGE" }, time: 3 },
    };
    const check = timedAssetCompletionPrecondition({
      ...observation,
      occurrenceId: null,
    });
    expect(check(legacy, { ...legacy, activeQueueId: undefined })).toBe(false);
    expect(check(legacy, { ...legacy, playing: undefined })).toBe(false);
  });

  it("preserves an existing occurrence and nullable duration", () => {
    const raw = { asset: { key: "A", type: "IMAGE" }, occurrenceId: "first-A" };
    expect(parseCurrentAsset(raw)).toEqual({ ...raw, time: null });
  });
});
