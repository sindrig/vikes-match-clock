import { describe, expect, it } from "vitest";
import { deriveBandRequest } from "./bandDerivation";
import type { CurrentAsset } from "../types";

function assetOf(asset: CurrentAsset["asset"]): CurrentAsset {
  return { asset, time: null };
}

describe("deriveBandRequest", () => {
  const validPlayer = {
    type: "PLAYER",
    name: "Jón",
    number: 7,
    teamName: "Víkingur R",
  };

  it.each([
    { name: 123 },
    { fullName: false },
    { teamName: [] },
    { key: {} },
    { number: [7] },
    { number: true },
  ])(
    "rejects malformed identity fields in players and both SUB sides: %j",
    (invalid) => {
      const player = { ...validPlayer, ...invalid };
      expect(deriveBandRequest({ asset: player })).toBeNull();
      for (const side of ["subIn", "subOut"]) {
        expect(
          deriveBandRequest({
            asset: {
              type: "SUB",
              subIn: validPlayer,
              subOut: validPlayer,
              [side]: player,
            },
          }),
        ).toBeNull();
      }
    },
  );

  it.each([null, undefined, 123, "player", [], {}])(
    "rejects malformed asset containers: %j",
    (value) => {
      expect(deriveBandRequest(value)).toBeNull();
      expect(deriveBandRequest({ asset: value })).toBeNull();
      for (const side of ["subIn", "subOut"]) {
        expect(
          deriveBandRequest({
            asset: {
              type: "SUB",
              subIn: validPlayer,
              subOut: validPlayer,
              [side]: value,
            },
          }),
        ).toBeNull();
      }
    },
  );

  it("returns null without a current asset", () => {
    expect(deriveBandRequest(null)).toBeNull();
  });

  it("derives a player identity from a PLAYER card", () => {
    expect(
      deriveBandRequest(
        assetOf({
          type: "PLAYER",
          key: "https://example.com/photo.png",
          name: "Jón",
          fullName: "Jón Jónsson",
          number: 7,
          teamName: "Víkingur R",
        }),
      ),
    ).toEqual({
      kind: "player",
      identity: {
        name: "Jón Jónsson",
        number: "7",
        teamName: "Víkingur R",
        imageRef: "https://example.com/photo.png",
      },
    });
  });

  it("derives a player identity without imageRef from a NO_IMAGE_PLAYER card", () => {
    expect(
      deriveBandRequest(
        assetOf({
          type: "NO_IMAGE_PLAYER",
          name: "Jón",
          number: "10",
          teamName: "Víkingur R",
        }),
      ),
    ).toEqual({
      kind: "player",
      identity: {
        name: "Jón",
        number: "10",
        teamName: "Víkingur R",
      },
    });
  });

  it("derives a player identity from a MOTM card", () => {
    const request = deriveBandRequest(
      assetOf({
        type: "MOTM",
        key: "https://example.com/motm.png",
        name: "Siggi",
        number: 4,
        teamName: "Víkingur R",
      }),
    );
    expect(request).toEqual({
      kind: "player",
      identity: {
        name: "Siggi",
        number: "4",
        teamName: "Víkingur R",
        imageRef: "https://example.com/motm.png",
      },
    });
  });

  it("normalizes numeric and padded number values", () => {
    const request = deriveBandRequest(
      assetOf({
        type: "PLAYER",
        name: "Jón",
        number: " 7 ",
        teamName: "Víkingur R",
      }),
    );
    expect(request).toMatchObject({
      kind: "player",
      identity: { number: "7" },
    });
  });

  it("rejects identities without a shirt number", () => {
    expect(
      deriveBandRequest(
        assetOf({
          type: "PLAYER",
          name: "Jón",
          teamName: "Víkingur R",
        }),
      ),
    ).toBeNull();
  });

  it("rejects identities with an oversized number", () => {
    expect(
      deriveBandRequest(
        assetOf({
          type: "PLAYER",
          name: "Jón",
          number: 12345,
          teamName: "Víkingur R",
        }),
      ),
    ).toBeNull();
  });

  it("rejects identities with an empty name", () => {
    expect(
      deriveBandRequest(
        assetOf({
          type: "PLAYER",
          name: "   ",
          number: 7,
          teamName: "Víkingur R",
        }),
      ),
    ).toBeNull();
  });

  it("rejects identities with an oversized name", () => {
    expect(
      deriveBandRequest(
        assetOf({
          type: "PLAYER",
          name: "x".repeat(81),
          number: 7,
          teamName: "Víkingur R",
        }),
      ),
    ).toBeNull();
  });

  it("rejects identities without a team name", () => {
    expect(
      deriveBandRequest(
        assetOf({
          type: "PLAYER",
          name: "Jón",
          number: 7,
        }),
      ),
    ).toBeNull();
  });

  it("skips goal-celebration assets", () => {
    expect(
      deriveBandRequest(
        assetOf({
          type: "PLAYER",
          name: "Jón",
          number: 7,
          teamName: "Víkingur R",
          isGoalCelebration: true,
        }),
      ),
    ).toBeNull();
  });

  it("derives a substitution request from a valid SUB asset", () => {
    expect(
      deriveBandRequest(
        assetOf({
          type: "SUB",
          key: "sub-key",
          subIn: {
            type: "PLAYER",
            key: "https://example.com/on.png",
            name: "Jón",
            number: 7,
            teamName: "Víkingur R",
          },
          subOut: {
            type: "PLAYER",
            key: "https://example.com/off.png",
            name: "Siggi",
            number: 12,
            teamName: "Víkingur R",
          },
        }),
      ),
    ).toEqual({
      kind: "substitution",
      off: {
        name: "Siggi",
        number: "12",
        teamName: "Víkingur R",
        imageRef: "https://example.com/off.png",
      },
      on: {
        name: "Jón",
        number: "7",
        teamName: "Víkingur R",
        imageRef: "https://example.com/on.png",
      },
    });
  });

  it("rejects a SUB asset missing one side", () => {
    expect(
      deriveBandRequest(
        assetOf({
          type: "SUB",
          key: "sub-key",
          subIn: {
            type: "PLAYER",
            name: "Jón",
            number: 7,
            teamName: "Víkingur R",
          },
        }),
      ),
    ).toBeNull();
  });

  it("rejects a SUB asset with one invalid identity", () => {
    expect(
      deriveBandRequest(
        assetOf({
          type: "SUB",
          key: "sub-key",
          subIn: {
            type: "PLAYER",
            name: "Jón",
            number: 7,
            teamName: "Víkingur R",
          },
          subOut: {
            type: "PLAYER",
            name: "Siggi",
            number: "12a",
            teamName: "Víkingur R",
          },
        }),
      ),
    ).toBeNull();
  });

  it("rejects unknown asset types", () => {
    expect(
      deriveBandRequest(
        assetOf({ type: "IMAGE", key: "https://example.com/ad.png" }),
      ),
    ).toBeNull();
    expect(
      deriveBandRequest(assetOf({ type: "VIDEO", key: "clip.mp4" })),
    ).toBeNull();
    expect(
      deriveBandRequest(assetOf({ type: "URL", key: "https://example.com" })),
    ).toBeNull();
  });
});
