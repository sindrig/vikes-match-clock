import type { PerimeterDisplayConfig, PerimeterRegion } from "../types";
import { validatePerimeterMapping } from "./perimeterMapping";

export interface PerimeterRenderSources {
  base: Record<string, TexImageSource>;
  overlay?: Record<string, TexImageSource>;
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

export class PerimeterWebGLRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly positionBuffer: WebGLBuffer;
  private readonly uvBuffer: WebGLBuffer;
  private readonly textures = new Map<string, WebGLTexture>();
  private readonly textureSources = new Map<string, TexImageSource>();
  private configuration: PerimeterDisplayConfig;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    configuration: PerimeterDisplayConfig,
  ) {
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
    this.canvas.width = configuration.framebuffer.width;
    this.canvas.height = configuration.framebuffer.height;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    return true;
  }

  uploadSource(textureKey: string, source: TexImageSource): void {
    const gl = this.gl;
    const isVideo =
      typeof HTMLVideoElement !== "undefined" &&
      source instanceof HTMLVideoElement;
    if (!isVideo && this.textureSources.get(textureKey) === source) return;
    const texture = this.textures.get(textureKey) ?? gl.createTexture();
    if (!texture) throw new Error("Unable to create perimeter texture.");
    this.textures.set(textureKey, texture);
    this.textureSources.set(textureKey, source);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  render(sources: PerimeterRenderSources): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    this.drawChannel(sources.base, "base");
    if (sources.overlay) this.drawChannel(sources.overlay, "overlay");
  }

  private drawChannel(
    sources: Record<string, TexImageSource>,
    channel: "base" | "overlay",
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
      this.uploadSource(textureKey, source);
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
    this.gl.deleteBuffer(this.positionBuffer);
    this.gl.deleteBuffer(this.uvBuffer);
    this.gl.deleteProgram(this.program);
  }
}
