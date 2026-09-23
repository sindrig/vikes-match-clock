import type { PerimeterDisplayConfig, PerimeterRegion } from "../types";
import { validatePerimeterMapping } from "./perimeterMapping";

export interface PerimeterRenderSources {
  base: Record<string, TexImageSource>;
  // The band channel (player/substitution band) composites above the base
  // deck and below the overlay channel.
  band?: Record<string, TexImageSource>;
  overlay?: Record<string, TexImageSource>;
  // Animated scorer/band presentations keep the same canvas identity. Mark
  // the refreshes where their capped animation advances so the channel
  // re-uploads only those changed canvases. The flags are independent so
  // band frames can refresh while base videos keep their own cadence.
  bandDynamic?: boolean;
  overlayDynamic?: boolean;
}

export interface PerimeterRendererOptions {
  onError?: (message: string) => void;
}

export function regionVertices(
  region: PerimeterRegion,
  framebufferWidth: number,
  framebufferHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): { positions: number[]; uvs: number[] } {
  const left = (region.destination.x / framebufferWidth) * 2 - 1;
  const right =
    ((region.destination.x + region.destination.width) / framebufferWidth) * 2 -
    1;
  const top = 1 - (region.destination.y / framebufferHeight) * 2;
  const bottom =
    1 -
    ((region.destination.y + region.destination.height) / framebufferHeight) *
      2;
  const u0 = region.source.x / sourceWidth;
  const u1 = (region.source.x + region.source.width) / sourceWidth;
  const v0 = region.source.y / sourceHeight;
  const v1 = (region.source.y + region.source.height) / sourceHeight;
  const horizontal = region.transform.flipX;
  const vertical = region.transform.flipY;
  const uv = (u: number, v: number): number[] => [
    horizontal ? u1 - (u - u0) : u,
    vertical ? v1 - (v - v0) : v,
  ];

  const corners: Array<{ position: number[]; uv: number[] }> = [
    { position: [left, top], uv: uv(u0, v0) },
    { position: [right, top], uv: uv(u1, v0) },
    { position: [left, bottom], uv: uv(u0, v1) },
    { position: [right, bottom], uv: uv(u1, v1) },
  ];
  if (region.transform.rotation === 90 || region.transform.rotation === 270) {
    const rotated =
      region.transform.rotation === 90
        ? [corners[2]!, corners[0]!, corners[3]!, corners[1]!]
        : [corners[1]!, corners[3]!, corners[0]!, corners[2]!];
    return {
      positions: rotated.flatMap((corner) => corner.position),
      uvs: rotated.flatMap((corner) => corner.uv),
    };
  }
  return {
    positions: corners.flatMap((corner) => corner.position),
    uvs: corners.flatMap((corner) => corner.uv),
  };
}

const vertexShaderSource = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 textureUv;
void main() {
  textureUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragmentShaderSource = `
precision mediump float;
uniform sampler2D image;
varying vec2 textureUv;
void main() {
  gl_FragColor = texture2D(image, textureUv);
}`;

function intrinsicDimensions(
  source: TexImageSource,
): { width: number; height: number } | null {
  if (
    typeof HTMLVideoElement !== "undefined" &&
    source instanceof HTMLVideoElement
  )
    return { width: source.videoWidth, height: source.videoHeight };
  if (
    typeof HTMLImageElement !== "undefined" &&
    source instanceof HTMLImageElement
  )
    return { width: source.naturalWidth, height: source.naturalHeight };
  if (
    typeof HTMLCanvasElement !== "undefined" &&
    source instanceof HTMLCanvasElement
  )
    return { width: source.width, height: source.height };
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap)
    return { width: source.width, height: source.height };
  const candidate = source as { width?: unknown; height?: unknown };
  if (
    typeof candidate.width === "number" &&
    typeof candidate.height === "number"
  )
    return { width: candidate.width, height: candidate.height };
  return null;
}

function shader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const result = gl.createShader(type);
  if (!result) throw new Error("Unable to create perimeter shader.");
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(result) ?? "Perimeter shader failed.");
  }
  return result;
}

const downscaledSources = new WeakMap<TexImageSource, HTMLCanvasElement>();

function downscaleInto(
  source: HTMLImageElement | ImageBitmap,
  dimensions: { width: number; height: number },
  maxSize: number,
): HTMLCanvasElement | null {
  const scale = Math.min(
    maxSize / dimensions.width,
    maxSize / dimensions.height,
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(dimensions.width * scale));
  canvas.height = Math.max(1, Math.round(dimensions.height * scale));
  let context: CanvasRenderingContext2D | null;
  try {
    context = canvas.getContext("2d");
  } catch {
    context = null;
  }
  if (!context) return null;
  try {
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
  downscaledSources.set(source, canvas);
  return canvas;
}

export class PerimeterWebGLRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly positionBuffer: WebGLBuffer;
  private readonly uvBuffer: WebGLBuffer;
  private readonly textures = new Map<string, WebGLTexture>();
  private readonly textureSources = new Map<string, TexImageSource>();
  private readonly oversizedLogged = new Set<string>();
  private readonly oversizedErrors = new Map<string, string>();
  private readonly onError?: (message: string) => void;
  private downscaleUnavailable = false;
  private configuration: PerimeterDisplayConfig;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    configuration: PerimeterDisplayConfig,
    options: PerimeterRendererOptions = {},
  ) {
    this.onError = options.onError;
    if (!validatePerimeterMapping(configuration).valid) {
      throw new Error("Invalid perimeter mapping cannot be rendered.");
    }
    const gl =
      canvas.getContext("webgl", { alpha: false, antialias: false }) ??
      canvas.getContext("experimental-webgl");
    if (!gl || !(gl instanceof WebGLRenderingContext)) {
      throw new Error("WebGL is unavailable for perimeter display.");
    }
    this.gl = gl;
    this.configuration = configuration;
    this.canvas.width = configuration.framebuffer.width;
    this.canvas.height = configuration.framebuffer.height;

    const vertex = shader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragment = shader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to create perimeter program.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        gl.getProgramInfoLog(program) ?? "Perimeter program failed.",
      );
    }
    this.program = program;
    const positionBuffer = gl.createBuffer();
    const uvBuffer = gl.createBuffer();
    if (!positionBuffer || !uvBuffer)
      throw new Error("Unable to create perimeter buffers.");
    this.positionBuffer = positionBuffer;
    this.uvBuffer = uvBuffer;
    gl.useProgram(program);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  replaceConfiguration(configuration: PerimeterDisplayConfig): boolean {
    if (!validatePerimeterMapping(configuration).valid) return false;
    this.configuration = configuration;
    for (const texture of this.textures.values())
      this.gl.deleteTexture(texture);
    this.textures.clear();
    this.textureSources.clear();
    this.oversizedLogged.clear();
    this.oversizedErrors.clear();
    this.canvas.width = configuration.framebuffer.width;
    this.canvas.height = configuration.framebuffer.height;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    return true;
  }

  // Deletes every uploaded texture of a channel so content that is no longer
  // live can never be re-drawn: drawChannel binds `null` for a region without
  // a texture instead of the previous generation's pixels.
  clearChannel(channel: "base" | "band" | "overlay"): void {
    const prefix = `${channel}:`;
    let emitted = false;
    for (const [key, texture] of [...this.textures]) {
      if (!key.startsWith(prefix)) continue;
      this.gl.deleteTexture(texture);
      this.textures.delete(key);
      this.textureSources.delete(key);
      this.oversizedLogged.delete(key);
      if (this.oversizedErrors.delete(key)) emitted = true;
    }
    if (emitted) this.emitError();
  }

  uploadSource(
    textureKey: string,
    source: TexImageSource,
    dynamic = false,
  ): void {
    const gl = this.gl;
    const isVideo =
      typeof HTMLVideoElement !== "undefined" &&
      source instanceof HTMLVideoElement;
    if (isVideo && source.readyState < 2) {
      // The video has not decoded its first frame yet; texImage2D would
      // upload zeros (Firefox logs "Resource has no data (yet?)") and the
      // texture would stay incomplete. Skip and keep the previous frame.
      return;
    }
    const dimensions = intrinsicDimensions(source);
    if (dimensions && (dimensions.width <= 0 || dimensions.height <= 0)) {
      // A zero-size source would leave the texture incomplete forever.
      return;
    }
    let effectiveSource = source;
    if (dimensions) {
      const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      if (
        Number.isFinite(maxSize) &&
        (dimensions.width > maxSize || dimensions.height > maxSize)
      ) {
        const scaled = this.downscaleSource(source, dimensions, maxSize);
        if (!scaled) {
          // texImage2D on an oversized source fails ("Requested size at this
          // level is unsupported") and the region renders black permanently.
          // Log once per texture; keep the error active until the source
          // fits or the configuration is replaced so a later successful
          // preparation cannot hide a still-broken texture.
          const message = `Perimeter media too large for this GPU: ${dimensions.width}x${dimensions.height} exceeds max texture size ${maxSize} (${textureKey}). Re-export the asset at a smaller size.`;
          if (!this.oversizedLogged.has(textureKey)) {
            this.oversizedLogged.add(textureKey);
            console.error(message);
          }
          if (!this.oversizedErrors.has(textureKey)) {
            this.oversizedErrors.set(textureKey, message);
            this.emitError();
          }
          return;
        }
        effectiveSource = scaled;
      }
    }
    if (
      !isVideo &&
      !dynamic &&
      this.textureSources.get(textureKey) === effectiveSource
    )
      return;
    const texture = this.textures.get(textureKey) ?? gl.createTexture();
    if (!texture) throw new Error("Unable to create perimeter texture.");
    this.textures.set(textureKey, texture);
    this.textureSources.set(textureKey, effectiveSource);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      effectiveSource,
    );
    this.clearOversize(textureKey);
  }

  private clearOversize(textureKey: string): void {
    if (this.oversizedErrors.delete(textureKey)) this.emitError();
  }

  private emitError(): void {
    // Emits only when the set of oversized textures changes, so the display
    // receives a stable message instead of per-frame churn.
    this.onError?.([...this.oversizedErrors.values()].join(" "));
  }

  private downscaleSource(
    source: TexImageSource,
    dimensions: { width: number; height: number },
    maxSize: number,
  ): HTMLCanvasElement | null {
    if (this.downscaleUnavailable) return null;
    // Static images can be redrawn into a smaller offscreen canvas once;
    // videos cannot (a per-frame drawImage of a 15k-wide frame is far too
    // expensive), so they keep the skip-and-report behavior.
    if (
      typeof HTMLImageElement !== "undefined" &&
      source instanceof HTMLImageElement
    )
      return this.drawDownscaled(source, dimensions, maxSize);
    if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap)
      return this.drawDownscaled(source, dimensions, maxSize);
    return null;
  }

  private drawDownscaled(
    source: HTMLImageElement | ImageBitmap,
    dimensions: { width: number; height: number },
    maxSize: number,
  ): HTMLCanvasElement | null {
    const cached = downscaledSources.get(source);
    if (cached) return cached;
    const canvas = downscaleInto(source, dimensions, maxSize);
    if (!canvas) {
      // Remembered so a broken environment does not retry the allocation
      // (and the oversized report) on every frame.
      this.downscaleUnavailable = true;
      return null;
    }
    return canvas;
  }

  render(sources: PerimeterRenderSources): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    this.drawChannel(sources.base, "base", false);
    if (sources.band) {
      this.drawChannel(sources.band, "band", sources.bandDynamic === true);
    }
    if (sources.overlay) {
      this.drawChannel(
        sources.overlay,
        "overlay",
        sources.overlayDynamic === true,
      );
    }
  }

  private drawChannel(
    sources: Record<string, TexImageSource>,
    channel: "base" | "band" | "overlay",
    dynamic: boolean,
  ): void {
    const gl = this.gl;
    const positionLocation = gl.getAttribLocation(this.program, "position");
    const uvLocation = gl.getAttribLocation(this.program, "uv");
    const textureLocation = gl.getUniformLocation(this.program, "image");
    const regions = [...this.configuration.regions].sort(
      (first, second) => first.transform.zIndex - second.transform.zIndex,
    );

    for (const region of regions) {
      const source = sources[region.logicalScreenId];
      if (!source) continue;
      const textureKey = `${channel}:${region.logicalScreenId}`;
      this.uploadSource(textureKey, source, dynamic);
      const screen = this.configuration.logicalScreens[region.logicalScreenId];
      if (!screen) continue;
      const vertices = regionVertices(
        region,
        this.configuration.framebuffer.width,
        this.configuration.framebuffer.height,
        screen.width,
        screen.height,
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(vertices.positions),
        gl.STREAM_DRAW,
      );
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(vertices.uvs),
        gl.STREAM_DRAW,
      );
      gl.enableVertexAttribArray(uvLocation);
      gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.textures.get(textureKey) ?? null);
      gl.uniform1i(textureLocation, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  dispose(): void {
    for (const texture of this.textures.values())
      this.gl.deleteTexture(texture);
    this.textures.clear();
    this.textureSources.clear();
    this.oversizedLogged.clear();
    this.oversizedErrors.clear();
    this.gl.deleteBuffer(this.positionBuffer);
    this.gl.deleteBuffer(this.uvBuffer);
    this.gl.deleteProgram(this.program);
  }
}
