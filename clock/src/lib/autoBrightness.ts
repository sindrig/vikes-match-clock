import SunCalc from "suncalc";
import { PerimeterBrightnessAutoConfig } from "../types";

// -- Automatic perimeter brightness model -------------------------------------
//
// Pure prediction math shared with the perimeter-control daemon (see
// docs/auto-brightness-design.md). The controller uses it only for the 24 h
// target-curve preview; the daemon computes and writes the actual values.
//
// The sun part is exact offline math (SunCalc); the cloud part is forecast
// data, so a rendered preview is honest about the sun and approximate about
// clouds. The cloud term uses the Kasten & Czeplak (1980) relation.

// Venue location (Fossvogur, Reykjavík). A ±1 km position error is < 0.01°
// of sun elevation and irrelevant for brightness. Iceland is UTC year-round,
// so no DST handling is needed anywhere.
export const VENUE_LAT = 64.117;
export const VENUE_LNG = -21.91;

// Defaults from docs/auto-brightness-design.md (to be calibrated against
// manual overrides later via the Phase 3 fit tool).
export const DEFAULT_BRIGHTNESS_AUTO_CONFIG: PerimeterBrightnessAutoConfig = {
  enabled: false,
  min: 3,
  max: 100,
  exponent: 0.35,
  cloudWeight: 1.0,
  luxMin: 5,
  luxMax: 100000,
};

export const AUTO_EXPONENT_MIN = 0.05;
export const AUTO_EXPONENT_MAX = 2;

export const OPEN_METEO_FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=64.117&longitude=-21.91" +
  "&current=cloud_cover&hourly=cloud_cover&forecast_days=2" +
  "&timezone=Atlantic%2FReykjavik";

// Sun elevation in degrees above the horizon for a UTC instant. Suncalc v1
// returns altitude in radians; the daemon applies the same conversion.
export function sunElevationDeg(
  date: Date,
  lat: number = VENUE_LAT,
  lng: number = VENUE_LNG,
): number {
  return (SunCalc.getPosition(date, lat, lng).altitude * 180) / Math.PI;
}

// Piecewise clear-sky illuminance tuned to typical daylight values
// (~100 000 lux at high sun; civil twilight ≈ tens of lux; night floor 0.5).
export function clearSkyLux(elevDeg: number): number {
  if (elevDeg >= 0) return 120000 * Math.sin((elevDeg * Math.PI) / 180) ** 1.15;
  if (elevDeg >= -6) return 400 * ((elevDeg + 6) / 6); // civil twilight ramp
  return 0.5; // night ambient floor
}

// Cloud multiplier (Kasten & Czeplak): fully overcast (c = 1) ≈ 25% of
// clear-sky light. cloudWeight 0 ignores clouds, 1 is the full relation.
// Cubic on purpose: thin high clouds barely dim, only solid decks do.
export function applyCloud(
  lux: number,
  cloudFraction: number,
  cloudWeight: number = 1,
): number {
  const c = Math.min(Math.max(cloudFraction, 0), 1);
  const w = Math.min(Math.max(cloudWeight, 0), 1);
  return Math.max(lux * (1 - w * 0.75 * c ** 3), 0.5);
}

// Lux → percent: power law between two anchor points (perceptual mapping).
export function luxToPercent(
  lux: number,
  config: PerimeterBrightnessAutoConfig,
): number {
  const x =
    (Math.max(lux, config.luxMin) - config.luxMin) /
    (config.luxMax - config.luxMin);
  const y = Math.min(Math.max(x, 0), 1) ** config.exponent;
  return Math.round(config.min + (config.max - config.min) * y);
}

export interface PredictedBrightness {
  lux: number;
  percent: number;
  sunElevationDeg: number;
}

// One prediction: sun elevation (exact) → clear-sky lux → cloud multiplier →
// percent through the configured curve.
export function predictAt(
  date: Date,
  config: PerimeterBrightnessAutoConfig,
  cloudFraction: number,
): PredictedBrightness {
  const elevationDeg = sunElevationDeg(date);
  const lux = applyCloud(
    clearSkyLux(elevationDeg),
    cloudFraction,
    config.cloudWeight,
  );
  return {
    lux,
    percent: luxToPercent(lux, config),
    sunElevationDeg: elevationDeg,
  };
}

// -- Config validation (mirrored by the brightnessAuto rules) -----------------

// Returns an Icelandic error message for the first violated constraint, or
// null when the config is writable: min 0..max, max min..100, exponent
// 0.05..2, cloudWeight 0..1, luxMin < luxMax.
export function validateBrightnessAutoConfig(
  config: PerimeterBrightnessAutoConfig,
): string | null {
  if (!Number.isInteger(config.min) || config.min < 0) {
    return "Lágmark verður að vera heiltala sem er 0 eða hærri.";
  }
  if (!Number.isInteger(config.max) || config.max > 100) {
    return "Hámark verður að vera heiltala sem er 100 eða lægri.";
  }
  if (config.min > config.max) {
    return "Lágmark má ekki vera hærra en hámark.";
  }
  if (
    typeof config.exponent !== "number" ||
    !Number.isFinite(config.exponent) ||
    config.exponent < AUTO_EXPONENT_MIN ||
    config.exponent > AUTO_EXPONENT_MAX
  ) {
    return "Ákeðni verður að vera á bilinu 0.05 til 2.";
  }
  if (
    typeof config.cloudWeight !== "number" ||
    !Number.isFinite(config.cloudWeight) ||
    config.cloudWeight < 0 ||
    config.cloudWeight > 1
  ) {
    return "Skýjaáhrif verða að vera á bilinu 0 til 1.";
  }
  if (!Number.isFinite(config.luxMin) || !Number.isFinite(config.luxMax)) {
    return "Ljósamörk (lux) verða að vera tölur.";
  }
  if (config.luxMin >= config.luxMax) {
    return "Lágmarks-lux verður að vera lægra en hámarks-lux.";
  }
  return null;
}

// -- 24 h target-curve preview ------------------------------------------------

export interface TargetCurvePoint {
  time: number; // UTC ms
  percent: number;
}

// Nearest-hour cloud-cover lookup over the forecast's hourly array; null
// when the requested instant is outside the fetched range.
export function cloudCoverAtTime(
  hourlyTimes: readonly number[],
  hourlyCloudCover: readonly number[],
  time: number,
): number | null {
  if (hourlyTimes.length === 0 || hourlyCloudCover.length === 0) return null;
  const first = hourlyTimes[0];
  const last = hourlyTimes[hourlyTimes.length - 1];
  if (first === undefined || last === undefined) return null;
  if (time < first || time > last) {
    return null;
  }
  let nearest = 0;
  let bestDistance = Math.abs(first - time);
  for (let i = 1; i < hourlyTimes.length; i += 1) {
    const candidate = hourlyTimes[i];
    if (candidate === undefined) return null;
    const distance = Math.abs(candidate - time);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = i;
    }
  }
  const cover = hourlyCloudCover[nearest];
  return typeof cover === "number" && Number.isFinite(cover) ? cover : null;
}

export const CURVE_SAMPLE_INTERVAL_MS = 15 * 60 * 1000;
export const CURVE_HOURS = 24;

// Builds the auto-target curve for the next 24 h from `startTime`, sampling
// every 15 minutes. `cloudAt` returns the forecast cloud cover fraction
// (0..1) for a UTC instant, or null when no forecast exists (the curve then
// shows the clear-sky shape).
export function buildTargetCurve(
  startTime: number,
  config: PerimeterBrightnessAutoConfig,
  cloudAt: (time: number) => number | null,
): TargetCurvePoint[] {
  const points: TargetCurvePoint[] = [];
  const total = CURVE_HOURS * 60 * 60 * 1000;
  for (let offset = 0; offset <= total; offset += CURVE_SAMPLE_INTERVAL_MS) {
    const time = startTime + offset;
    const cloud = cloudAt(time) ?? 0;
    points.push({
      time,
      percent: predictAt(new Date(time), config, cloud).percent,
    });
  }
  return points;
}

// -- Open-Meteo cloud-cover forecast (preview only) ---------------------------

export interface CloudCoverForecast {
  times: number[]; // UTC ms, ascending
  cloudCover: number[]; // fraction 0..1, parallel to times
  fetchedAt: number;
}

// Open-Meteo returns local times for the requested timezone. With
// Atlantic/Reykjavik that is UTC year-round, but the ISO strings carry no
// offset, so they are normalized to UTC explicitly instead of relying on
// the device being in Iceland.
export function parseIsoUtc(value: unknown): number | null {
  if (typeof value !== "string") return null;
  if (/z$/i.test(value) || /[+-]\d{2}:?\d{2}$/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const normalized = value.length === 16 ? `${value}:00Z` : `${value}Z`;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

// Strict parse of an Open-Meteo forecast response. Only the hourly cloud
// cover array is used; any malformed entry drops the whole forecast (the
// caller falls back to the clear-sky curve).
export function parseCloudForecast(
  data: unknown,
  fetchedAt: number,
): CloudCoverForecast | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;
  const hourly = raw.hourly;
  if (!hourly || typeof hourly !== "object") return null;
  const hourlyRaw = hourly as Record<string, unknown>;
  const hourlyTimesRaw = hourlyRaw.time as unknown[] | undefined;
  const hourlyCoverRaw = hourlyRaw.cloud_cover as unknown[] | undefined;
  if (
    !Array.isArray(hourlyTimesRaw) ||
    !Array.isArray(hourlyCoverRaw) ||
    hourlyTimesRaw.length !== hourlyCoverRaw.length
  ) {
    return null;
  }

  const times: number[] = [];
  const cloudCover: number[] = [];
  for (let i = 0; i < hourlyTimesRaw.length; i += 1) {
    const time = parseIsoUtc(hourlyTimesRaw[i]);
    const cover = hourlyCoverRaw[i];
    if (time === null || typeof cover !== "number" || !Number.isFinite(cover)) {
      return null;
    }
    times.push(time);
    cloudCover.push(Math.min(Math.max(cover / 100, 0), 1));
  }
  if (times.length === 0) return null;
  return { times, cloudCover, fetchedAt };
}

export async function fetchCloudForecast(): Promise<CloudCoverForecast | null> {
  try {
    const response = await fetch(OPEN_METEO_FORECAST_URL);
    if (!response.ok) return null;
    const data = (await response.json()) as unknown;
    return parseCloudForecast(data, Date.now());
  } catch {
    return null;
  }
}
