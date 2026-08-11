/* Resolume composition reader for the perimeter preview snapshot.
 *
 * This module is deliberately isolated from the rest of the daemon: every
 * Resolume-version-specific assumption lives here. The rest of the daemon
 * only deals with the normalized preview snapshot shape:
 *
 *   { columns: [ { id, name, clips: [ { id, filename, thumbnail? } ] } ] }
 *
 * The composition is read from the full composition tree
 * (`GET /api/v1/composition`). Columns are top-level nodes
 * (`composition.columns[]`), and clips live in a grid: each layer holds one
 * clip per column (`layer.clips[columnIndex - 1]`), so a column's clips are
 * the stack of clips at the same column position across layers.
 *
 * Field access is tolerant. Resolume wraps parameter values in
 * `{ value: ... }` objects and the exact shape can differ between installed
 * Resolume versions, so `paramValue()` unwraps `{ value }`, accepts a plain
 * string, and otherwise returns `undefined` so missing fields are omitted
 * instead of breaking the whole snapshot.
 *
 * Clip thumbnails come from
 * `GET /api/v1/composition/layers/{layer}/clips/{column}/thumbnail`, which
 * returns the raw PNG image bytes. Thumbnails are re-encoded as bounded JPEG
 * data URLs (`reencodeThumbnail`) before they are published.
 */

import path from "node:path";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

// Unwrap a Resolume parameter value: `{ value: "x" }` -> "x", plain string
// -> itself, anything else -> undefined.
export function paramValue(node, key) {
  if (!node || typeof node !== "object") return undefined;
  const value = node[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object") {
    return typeof value.value === "string" ? value.value : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

// The clip's source filename lives in the video (or audio) fileinfo path,
// with a plain `filename` field as a version-tolerant fallback.
export function extractClipFilename(clip) {
  if (!clip || typeof clip !== "object") return undefined;
  const direct = typeof clip.filename === "string" ? clip.filename : undefined;
  const video = clip.video?.fileinfo?.path;
  const audio = clip.audio?.fileinfo?.path;
  const candidate = direct ?? (typeof video === "string" ? video : undefined)
    ?? (typeof audio === "string" ? audio : undefined);
  if (!candidate) return undefined;
  const basename = path.posix.basename(candidate.replace(/\\/g, "/"));
  return basename || undefined;
}

// Top-level columns of the composition tree. The unique id is used when
// present, otherwise the 1-based position in the tree is a stable fallback.
export function parseColumns(composition) {
  if (!composition || typeof composition !== "object") return [];
  const rawColumns = Array.isArray(composition.columns)
    ? composition.columns
    : [];
  return rawColumns
    .map((raw, index) => {
      if (!raw || typeof raw !== "object") return null;
      return {
        id: typeof raw.id === "number" ? raw.id : index + 1,
        name: paramValue(raw, "name") ?? `Column ${index + 1}`,
        position: index + 1,
      };
    })
    .filter(Boolean);
}

// Collect every non-empty clip, keyed by 1-based column position. Each entry
// carries its grid coordinates so the thumbnail endpoint can be addressed.
export function collectClipsByColumn(composition) {
  const byColumn = new Map();
  const layers = Array.isArray(composition?.layers) ? composition.layers : [];
  layers.forEach((layer, layerIndex) => {
    const clips =
      layer && typeof layer === "object" && Array.isArray(layer.clips)
        ? layer.clips
        : [];
    clips.forEach((raw, clipIndex) => {
      if (!raw || typeof raw !== "object") return;
      const filename = extractClipFilename(raw);
      if (filename === undefined) return;
      const columnIndex = clipIndex + 1;
      if (!byColumn.has(columnIndex)) byColumn.set(columnIndex, []);
      byColumn.get(columnIndex).push({
        id: typeof raw.id === "number" ? raw.id : undefined,
        name: paramValue(raw, "name"),
        filename,
        layerIndex: layerIndex + 1,
        columnIndex,
      });
    });
  });
  return byColumn;
}

function rgbaToRgb(src, width, height) {
  const out = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < src.length; i += 4, j += 3) {
    out[j] = src[i];
    out[j + 1] = src[i + 1];
    out[j + 2] = src[i + 2];
  }
  return out;
}

// Area-average downscale from RGBA to RGB. Keeps aspect ratio and avoids the
// aliasing nearest-neighbor produces at large reductions.
function downscaleToRgb(src, srcW, srcH, dstW, dstH) {
  const out = Buffer.alloc(dstW * dstH * 3);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;
  for (let y = 0; y < dstH; y += 1) {
    const srcY0 = Math.floor(y * yRatio);
    const srcY1 = Math.min(srcH, Math.ceil((y + 1) * yRatio));
    for (let x = 0; x < dstW; x += 1) {
      const srcX0 = Math.floor(x * xRatio);
      const srcX1 = Math.min(srcW, Math.ceil((x + 1) * xRatio));
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let sy = srcY0; sy < srcY1; sy += 1) {
        for (let sx = srcX0; sx < srcX1; sx += 1) {
          const i = (sy * srcW + sx) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          count += 1;
        }
      }
      const j = (y * dstW + x) * 3;
      out[j] = Math.round(r / count);
      out[j + 1] = Math.round(g / count);
      out[j + 2] = Math.round(b / count);
    }
  }
  return out;
}

// Re-encode a PNG thumbnail as a bounded JPEG data URL. Returns
// `{ dataUrl, bytes, width, height }` or null when the input is not a valid
// PNG, the input is too large to decode safely, or the resulting data URL
// would exceed `maxBytes`.
export function reencodeThumbnail(
  pngBuffer,
  {
    maxDim = 320,
    quality = 0.7,
    maxBytes = 100_000,
    maxInputBytes = 4_000_000,
  } = {},
) {
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length === 0) return null;
  if (pngBuffer.length > maxInputBytes) return null;
  let decoded;
  try {
    decoded = PNG.sync.read(pngBuffer);
  } catch {
    return null;
  }
  const { width, height, data } = decoded;
  if (width <= 0 || height <= 0) return null;

  const scale = Math.min(1, maxDim / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));
  const rgb =
    scale < 1
      ? downscaleToRgb(data, width, height, outW, outH)
      : rgbaToRgb(data, width, height);

  let encoded;
  try {
    encoded = jpeg.encode({ data: rgb, width: outW, height: outH }, quality);
  } catch {
    return null;
  }
  const dataUrl = `data:image/jpeg;base64,${encoded.data.toString("base64")}`;
  // Bound the size actually published (the base64 data URL), not the raw JPEG.
  if (dataUrl.length > maxBytes) return null;
  return {
    dataUrl,
    bytes: encoded.data.length,
    width: outW,
    height: outH,
  };
}

export function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await fn(items[index], index);
      }
    },
  );
  return Promise.all(workers).then(() => results);
}

export class ResolumeCompositionReader {
  constructor(config) {
    this.baseUrl = String(config.resolumeBaseUrl).replace(/\/+$/, "");
    this.requestTimeoutMs = config.requestTimeoutMs;
    this.thumbnailMaxDim = config.thumbnailMaxDim;
    this.thumbnailQuality = config.thumbnailQuality;
    this.thumbnailMaxBytes = config.thumbnailMaxBytes;
    this.fetchImpl = config.fetchImpl;
    this.thumbnailConcurrency = config.thumbnailConcurrency ?? 4;
  }

  _fetch(url, options) {
    const fetchImpl = this.fetchImpl ?? globalThis.fetch;
    return fetchImpl(url, options);
  }

  async _getJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await this._fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Resolume ${url} returned HTTP ${response.status}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async readComposition() {
    return this._getJson(`${this.baseUrl}/composition`);
  }

  // Returns the raw thumbnail bytes (PNG) or null when the clip has no
  // thumbnail or the request fails. A missing thumbnail never fails the
  // whole preview.
  async fetchClipThumbnail(layerIndex, columnIndex) {
    const url = `${this.baseUrl}/composition/layers/${layerIndex}/clips/${columnIndex}/thumbnail`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await this._fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch (err) {
      console.error(`Failed to fetch Resolume thumbnail ${url}: ${err.message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // Build the normalized preview snapshot, attaching bounded JPEG thumbnails
  // where they could be fetched and re-encoded.
  async collectPreview() {
    const composition = await this.readComposition();
    const columns = parseColumns(composition);
    const clipsByColumn = collectClipsByColumn(composition);

    const clipsWithCoords = [];
    const normalized = columns.map((column) => ({
      id: column.id,
      name: column.name,
      clips: (clipsByColumn.get(column.position) ?? []).map((clip) => {
        const entry = { id: clip.id, filename: clip.filename };
        clipsWithCoords.push({
          entry,
          layerIndex: clip.layerIndex,
          clipColumnIndex: clip.columnIndex,
        });
        return entry;
      }),
    }));

    await mapWithConcurrency(
      clipsWithCoords,
      this.thumbnailConcurrency,
      async ({ entry, layerIndex, clipColumnIndex }) => {
        const png = await this.fetchClipThumbnail(layerIndex, clipColumnIndex);
        if (png === null) return;
        const converted = reencodeThumbnail(png, {
          maxDim: this.thumbnailMaxDim,
          quality: this.thumbnailQuality,
          maxBytes: this.thumbnailMaxBytes,
        });
        if (converted !== null) {
          entry.thumbnail = converted.dataUrl;
        }
      },
    );

    return { columns: normalized };
  }
}
