import { describe, it, expect } from "vitest";
import {
  DEFAULT_BRIGHTNESS_AUTO_CONFIG,
  applyCloud,
  buildTargetCurve,
  clearSkyLux,
  cloudCoverAtTime,
  luxToPercent,
  parseCloudForecast,
  parseIsoUtc,
  predictAt,
  sunElevationDeg,
  validateBrightnessAutoConfig,
} from "./autoBrightness";

// Reference vectors from docs/auto-brightness-design.md (2026-09-22,
// Fossvogur 64.117 N / −21.91 E, default config).
const FOSSVOGUR = { lat: 64.117, lng: -21.91 };

describe("sunElevationDeg", () => {
  it("matches the reference table for Fossvogur on 2026-09-22", () => {
    // Validated against known sun positions in the design (solstice noons,
    // tonight's sunset ≈ 19:35 UTC).
    expect(
      sunElevationDeg(
        new Date("2026-09-22T12:00:00Z"),
        FOSSVOGUR.lat,
        FOSSVOGUR.lng,
      ),
    ).toBeCloseTo(24.6, 1);
    expect(
      sunElevationDeg(
        new Date("2026-09-22T19:30:00Z"),
        FOSSVOGUR.lat,
        FOSSVOGUR.lng,
      ),
    ).toBeCloseTo(-0.8, 1);
    expect(
      sunElevationDeg(
        new Date("2026-09-22T21:00:00Z"),
        FOSSVOGUR.lat,
        FOSSVOGUR.lng,
      ),
    ).toBeLessThan(-10);
  });

  it("returns exactly 0 at a horizon crossing", () => {
    // Dawn/dusk at the equator on the equinox is ~6:00/18:00 local; the
    // exact 0° instant lies between them — search for the sign change.
    const morning = new Date("2026-09-22T06:12:00Z");
    const evening = new Date("2026-09-22T18:12:00Z");
    const equator = { lat: 0, lng: 0 };
    const morningElev = sunElevationDeg(morning, equator.lat, equator.lng);
    const eveningElev = sunElevationDeg(evening, equator.lat, equator.lng);
    expect(morningElev).toBeGreaterThan(0);
    expect(eveningElev).toBeLessThan(0);
    // Bisection to the 0° crossing.
    let low = morning.getTime();
    let high = evening.getTime();
    for (let i = 0; i < 64 && high - low > 1; i += 1) {
      const mid = (low + high) / 2;
      if (sunElevationDeg(new Date(mid), 0, 0) > 0) low = mid;
      else high = mid;
    }
    const crossing = sunElevationDeg(new Date((low + high) / 2), 0, 0);
    expect(Math.abs(crossing)).toBeLessThan(0.001);
  });
});

describe("clearSkyLux", () => {
  it("uses the piecewise approximation from the design", () => {
    expect(clearSkyLux(90)).toBe(120000);
    expect(clearSkyLux(90)).toBeCloseTo(
      120000 * Math.sin((90 * Math.PI) / 180) ** 1.15,
      5,
    );
    // Civil twilight ramp: 400 lux at −0°, 0 lux at −6°.
    expect(clearSkyLux(-3)).toBe(200);
    expect(clearSkyLux(-6)).toBe(0);
    // Night floor below civil twilight.
    expect(clearSkyLux(-6.5)).toBe(0.5);
    expect(clearSkyLux(-20)).toBe(0.5);
    // Exactly at the horizon: sin(0)^1.15 = 0.
    expect(clearSkyLux(0)).toBe(0);
  });
});

describe("applyCloud", () => {
  it("applies the Kasten-Czeplak cubic multiplier", () => {
    expect(applyCloud(1000, 0)).toBe(1000);
    expect(applyCloud(1000, 1)).toBeCloseTo(250, 5);
    expect(applyCloud(1000, 0.5)).toBeCloseTo(1000 * (1 - 0.75 * 0.125), 5);
  });

  it("respects cloudWeight", () => {
    expect(applyCloud(1000, 1, 0)).toBe(1000);
    expect(applyCloud(1000, 1, 0.5)).toBeCloseTo(625, 5);
  });

  it("clamps cloud fraction and weight out-of-range values", () => {
    expect(applyCloud(1000, 1.5)).toBeCloseTo(250, 5);
    expect(applyCloud(1000, -0.5)).toBe(1000);
    expect(applyCloud(1000, 1, 2)).toBeCloseTo(250, 5);
    expect(applyCloud(1000, 1, -1)).toBe(1000);
  });

  it("never goes below the 0.5 lux ambient floor", () => {
    expect(applyCloud(0, 0.5)).toBe(0.5);
    expect(applyCloud(1, 1)).toBeCloseTo(0.5, 5);
  });
});

describe("luxToPercent", () => {
  const config = DEFAULT_BRIGHTNESS_AUTO_CONFIG;

  it("maps luxMin onto min and luxMax onto max", () => {
    expect(luxToPercent(5, config)).toBe(3);
    expect(luxToPercent(100000, config)).toBe(100);
  });

  it("clamps below min and above max", () => {
    expect(luxToPercent(0, config)).toBe(3);
    expect(luxToPercent(0.5, config)).toBe(3);
    expect(luxToPercent(150000, config)).toBe(100);
  });

  it("reproduces the reference-table percentages", () => {
    expect(luxToPercent(43721, config)).toBe(76);
    expect(luxToPercent(10930, config)).toBe(48);
    expect(luxToPercent(315, config)).toBe(16);
  });
});

describe("predictAt (test vectors)", () => {
  // Same inputs as the reference table, defaults above.
  it("12:00Z clear → lux 43721, percent 76", () => {
    const result = predictAt(
      new Date("2026-09-22T12:00:00Z"),
      DEFAULT_BRIGHTNESS_AUTO_CONFIG,
      0,
    );
    expect(Math.round(result.lux)).toBe(43721);
    expect(result.percent).toBe(76);
  });

  it("12:00Z overcast → lux 10930, percent 48", () => {
    const result = predictAt(
      new Date("2026-09-22T12:00:00Z"),
      DEFAULT_BRIGHTNESS_AUTO_CONFIG,
      1,
    );
    expect(Math.round(result.lux)).toBe(10930);
    expect(result.percent).toBe(48);
  });

  it("19:30Z half cloud → lux 315, percent 16", () => {
    const result = predictAt(
      new Date("2026-09-22T19:30:00Z"),
      DEFAULT_BRIGHTNESS_AUTO_CONFIG,
      0.5,
    );
    expect(Math.round(result.lux)).toBe(315);
    expect(result.percent).toBe(16);
  });

  it("21:00Z night → min clamp 3", () => {
    const result = predictAt(
      new Date("2026-09-22T21:00:00Z"),
      DEFAULT_BRIGHTNESS_AUTO_CONFIG,
      0.3,
    );
    expect(result.percent).toBe(3);
  });

  it("09:00Z clear → 56 and overcast → 36 (sanity reference)", () => {
    const clear = predictAt(
      new Date("2026-09-22T09:00:00Z"),
      DEFAULT_BRIGHTNESS_AUTO_CONFIG,
      0,
    );
    const overcast = predictAt(
      new Date("2026-09-22T09:00:00Z"),
      DEFAULT_BRIGHTNESS_AUTO_CONFIG,
      1,
    );
    expect(clear.percent).toBe(56);
    expect(overcast.percent).toBe(36);
  });
});

describe("validateBrightnessAutoConfig", () => {
  it("accepts the defaults", () => {
    expect(
      validateBrightnessAutoConfig(DEFAULT_BRIGHTNESS_AUTO_CONFIG),
    ).toBeNull();
  });

  it("accepts valid edited values", () => {
    expect(
      validateBrightnessAutoConfig({
        enabled: true,
        min: 0,
        max: 100,
        exponent: 0.05,
        cloudWeight: 0,
        luxMin: 1,
        luxMax: 200000,
      }),
    ).toBeNull();
  });

  it("rejects min above max", () => {
    expect(
      validateBrightnessAutoConfig({
        ...DEFAULT_BRIGHTNESS_AUTO_CONFIG,
        min: 80,
        max: 50,
      }),
    ).not.toBeNull();
  });

  it("rejects max above 100 and negative min", () => {
    expect(
      validateBrightnessAutoConfig({
        ...DEFAULT_BRIGHTNESS_AUTO_CONFIG,
        max: 101,
      }),
    ).not.toBeNull();
    expect(
      validateBrightnessAutoConfig({
        ...DEFAULT_BRIGHTNESS_AUTO_CONFIG,
        min: -1,
      }),
    ).not.toBeNull();
  });

  it("rejects non-integer bounds", () => {
    expect(
      validateBrightnessAutoConfig({
        ...DEFAULT_BRIGHTNESS_AUTO_CONFIG,
        min: 3.5,
      }),
    ).not.toBeNull();
    expect(
      validateBrightnessAutoConfig({
        ...DEFAULT_BRIGHTNESS_AUTO_CONFIG,
        max: 99.5,
      }),
    ).not.toBeNull();
  });

  it("rejects exponent outside 0.05..2", () => {
    expect(
      validateBrightnessAutoConfig({
        ...DEFAULT_BRIGHTNESS_AUTO_CONFIG,
        exponent: 0.04,
      }),
    ).not.toBeNull();
    expect(
      validateBrightnessAutoConfig({
        ...DEFAULT_BRIGHTNESS_AUTO_CONFIG,
        exponent: 2.01,
      }),
    ).not.toBeNull();
  });

  it("accepts the exponent bounds and rejects cloudWeight outside 0..1", () => {
    expect(
      validateBrightnessAutoConfig({
        ...DEFAULT_BRIGHTNESS_AUTO_CONFIG,
        exponent: 0.05,
      }),
    ).toBeNull();
    expect(
      validateBrightnessAutoConfig({
        ...DEFAULT_BRIGHTNESS_AUTO_CONFIG,
        exponent: 2,
      }),
    ).toBeNull();
    expect(
      validateBrightnessAutoConfig({
        ...DEFAULT_BRIGHTNESS_AUTO_CONFIG,
        cloudWeight: -0.1,
      }),
    ).not.toBeNull();
    expect(
      validateBrightnessAutoConfig({
        ...DEFAULT_BRIGHTNESS_AUTO_CONFIG,
        cloudWeight: 1.1,
      }),
    ).not.toBeNull();
  });

  it("rejects luxMin >= luxMax", () => {
    expect(
      validateBrightnessAutoConfig({
        ...DEFAULT_BRIGHTNESS_AUTO_CONFIG,
        luxMin: 100000,
        luxMax: 100000,
      }),
    ).not.toBeNull();
    expect(
      validateBrightnessAutoConfig({
        ...DEFAULT_BRIGHTNESS_AUTO_CONFIG,
        luxMin: 200000,
        luxMax: 100000,
      }),
    ).not.toBeNull();
  });
});

describe("cloudCoverAtTime", () => {
  const hourlyTimes = [
    Date.parse("2026-09-22T10:00:00Z"),
    Date.parse("2026-09-22T11:00:00Z"),
    Date.parse("2026-09-22T12:00:00Z"),
  ];
  const hourlyCloudCover = [0.2, 0.4, 0.8];

  it("picks the nearest hour", () => {
    expect(
      cloudCoverAtTime(
        hourlyTimes,
        hourlyCloudCover,
        Date.parse("2026-09-22T11:59:00Z"),
      ),
    ).toBe(0.8);
    expect(
      cloudCoverAtTime(
        hourlyTimes,
        hourlyCloudCover,
        Date.parse("2026-09-22T10:00:00Z"),
      ),
    ).toBe(0.2);
  });

  it("returns null outside the range and for empty data", () => {
    expect(
      cloudCoverAtTime(
        hourlyTimes,
        hourlyCloudCover,
        Date.parse("2026-09-22T13:00:00Z"),
      ),
    ).toBeNull();
    expect(
      cloudCoverAtTime([], [], Date.parse("2026-09-22T10:00:00Z")),
    ).toBeNull();
  });
});

describe("buildTargetCurve", () => {
  it("samples every 15 minutes for 24 hours", () => {
    const start = Date.parse("2026-09-22T12:00:00Z");
    const points = buildTargetCurve(
      start,
      DEFAULT_BRIGHTNESS_AUTO_CONFIG,
      () => 0,
    );
    expect(points).toHaveLength(97);
    expect(points[0]?.time).toBe(start);
    expect(points[points.length - 1]?.time).toBe(start + 24 * 60 * 60 * 1000);
  });

  it("stays at the min floor through the night", () => {
    const start = Date.parse("2026-09-22T21:00:00Z");
    const points = buildTargetCurve(
      start,
      DEFAULT_BRIGHTNESS_AUTO_CONFIG,
      () => 0.5,
    );
    expect(points[0]?.percent).toBe(3);
    expect(points[96]?.percent).toBe(3);
  });

  it("matches the sanity reference at fixed instants", () => {
    // 2026-09-22, defaults: 09:00 clear → 56, 12:00 clear → 76,
    // 12:00 overcast → 48, night → 3.
    const config = DEFAULT_BRIGHTNESS_AUTO_CONFIG;
    const at = (iso: string, cloud: number) =>
      predictAt(new Date(iso), config, cloud).percent;
    expect(at("2026-09-22T09:00:00Z", 0)).toBe(56);
    expect(at("2026-09-22T12:00:00Z", 0)).toBe(76);
    expect(at("2026-09-22T12:00:00Z", 1)).toBe(48);
    expect(at("2026-09-22T21:00:00Z", 0)).toBe(3);
  });
});

describe("parseIsoUtc", () => {
  it("normalizes offset-less ISO strings to UTC", () => {
    expect(parseIsoUtc("2026-09-22T12:00")).toBe(
      Date.parse("2026-09-22T12:00:00Z"),
    );
    expect(parseIsoUtc("2026-09-22T12:00:00")).toBe(
      Date.parse("2026-09-22T12:00:00Z"),
    );
    expect(parseIsoUtc("2026-09-22T12:00:00Z")).toBe(
      Date.parse("2026-09-22T12:00:00Z"),
    );
  });

  it("rejects non-strings and garbage", () => {
    expect(parseIsoUtc(null)).toBeNull();
    expect(parseIsoUtc(42)).toBeNull();
    expect(parseIsoUtc("not-a-date")).toBeNull();
  });
});

describe("parseCloudForecast", () => {
  const response = {
    hourly: {
      time: ["2026-09-22T12:00", "2026-09-22T13:00"],
      cloud_cover: [30, 100],
    },
  };

  it("parses hourly cloud cover as fractions", () => {
    const forecast = parseCloudForecast(response, 1726968000000);
    expect(forecast).not.toBeNull();
    expect(forecast!.times).toEqual([
      Date.parse("2026-09-22T12:00:00Z"),
      Date.parse("2026-09-22T13:00:00Z"),
    ]);
    expect(forecast!.cloudCover).toEqual([0.3, 1]);
    expect(forecast!.fetchedAt).toBe(1726968000000);
  });

  it("rejects malformed shapes", () => {
    expect(parseCloudForecast(null, 0)).toBeNull();
    expect(parseCloudForecast({}, 0)).toBeNull();
    expect(
      parseCloudForecast({ hourly: { time: ["x"], cloud_cover: [1, 2] } }, 0),
    ).toBeNull();
    expect(
      parseCloudForecast(
        { hourly: { time: ["garbage"], cloud_cover: [50] } },
        0,
      ),
    ).toBeNull();
  });
});
