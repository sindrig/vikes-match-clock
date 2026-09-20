import { describe, expect, it, vi, afterEach } from "vitest";
import type { PerimeterDisplayConfig } from "../types";
import { capturedVikinConfiguration } from "./fixtures";
import { validatePerimeterMapping } from "./perimeterMapping";
import { PerimeterWebGLRenderer, regionVertices } from "./webglRenderer";

class FakeWebGLRenderingContext {
  readonly VERTEX_SHADER = 1;
  readonly FRAGMENT_SHADER = 2;
  readonly COMPILE_STATUS = 3;
  readonly LINK_STATUS = 4;
  readonly ARRAY_BUFFER = 5;
  readonly STREAM_DRAW = 6;
  readonly TEXTURE_2D = 7;
  readonly TEXTURE_MIN_FILTER = 8;
  readonly TEXTURE_MAG_FILTER = 9;
  readonly LINEAR = 10;
  readonly TEXTURE_WRAP_S = 11;
  readonly TEXTURE_WRAP_T = 12;
  readonly CLAMP_TO_EDGE = 13;
  readonly UNPACK_FLIP_Y_WEBGL = 14;
  readonly RGBA = 15;
  readonly UNSIGNED_BYTE = 16;
  readonly TEXTURE0 = 17;
  readonly TRIANGLE_STRIP = 18;
  readonly COLOR_BUFFER_BIT = 19;
  readonly FLOAT = 20;
  readonly MAX_TEXTURE_SIZE = 21;
  readonly clear = vi.fn();
  readonly clearColor = vi.fn();
  readonly drawArrays = vi.fn();
  readonly deleteTexture = vi.fn();
  readonly getParameter = vi.fn((parameter: number) =>
    parameter === 21 ? 4096 : 0,
  );

  createShader() {
    return {} as WebGLShader;
  }
  shaderSource() {
    return undefined;
  }
  compileShader() {
    return undefined;
  }
  getShaderParameter() {
    return true;
  }
  getShaderInfoLog() {
    return "";
  }
  createProgram() {
    return {} as WebGLProgram;
  }
  attachShader() {
    return undefined;
  }
  linkProgram() {
    return undefined;
  }
  getProgramParameter() {
    return true;
  }
  getProgramInfoLog() {
    return "";
  }
  createBuffer() {
    return {} as WebGLBuffer;
  }
  useProgram() {
    return undefined;
  }
  viewport() {
    return undefined;
  }
  createTexture() {
    return {} as WebGLTexture;
  }
  bindTexture() {
    return undefined;
  }
  texParameteri() {
    return undefined;
  }
  pixelStorei() {
    return undefined;
  }
  texImage2D = vi.fn();
  getAttribLocation() {
    return 0;
  }
  getUniformLocation() {
    return {} as WebGLUniformLocation;
  }
  bindBuffer() {
    return undefined;
  }
  bufferData() {
    return undefined;
  }
  enableVertexAttribArray() {
    return undefined;
  }
  vertexAttribPointer() {
    return undefined;
  }
  activeTexture() {
    return undefined;
  }
  uniform1i() {
    return undefined;
  }
  deleteBuffer() {
    return undefined;
  }
  deleteProgram() {
    return undefined;
  }
}

const identityConfiguration: PerimeterDisplayConfig = {
  version: 1,
  revision: "identity",
  renderer: "web",
  framebuffer: { width: 4, height: 2, background: "black" },
  logicalScreens: {
    screen: { id: "screen", name: "Screen", width: 4, height: 2 },
  },
  compatibilityKeys: { base: { "1": "screen" }, overlay: {} },
  regions: [
    {
      id: "screen-region",
      logicalScreenId: "screen",
      source: { x: 0, y: 0, width: 4, height: 2 },
      destination: { x: 0, y: 0, width: 4, height: 2 },
      transform: {
        rotation: 0,
        flipX: false,
        flipY: false,
        allowScaling: false,
        allowClipping: false,
        allowSourceOverlap: false,
        allowDestinationOverlap: false,
        zIndex: 0,
      },
    },
  ],
  playback: { cueDurationMs: 20_000, videoPolicy: "fit-to-cue" },
};

describe("PerimeterWebGLRenderer", () => {
  it("maps identity regions to the full framebuffer and clears black first", () => {
    const vertices = regionVertices(
      identityConfiguration.regions[0]!,
      4,
      2,
      4,
      2,
    );
    expect(vertices.positions).toEqual([-1, 1, 1, 1, -1, -1, 1, -1]);
    expect(vertices.uvs).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);

    vi.stubGlobal("WebGLRenderingContext", FakeWebGLRenderingContext);
    const canvas = document.createElement("canvas");
    const gl = new FakeWebGLRenderingContext();
    Object.defineProperty(canvas, "getContext", { value: () => gl });
    const renderer = new PerimeterWebGLRenderer(canvas, identityConfiguration);
    renderer.render({ base: { screen: {} as TexImageSource } });

    expect(canvas.width).toBe(4);
    expect(canvas.height).toBe(2);
    expect(gl.clearColor).toHaveBeenCalledWith(0, 0, 0, 1);
    expect(gl.clear).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT);
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    renderer.dispose();
    vi.unstubAllGlobals();
  });

  it("renders Víkin's two captured regions and leaves the remainder black", () => {
    expect(validatePerimeterMapping(capturedVikinConfiguration).valid).toBe(
      true,
    );
    const first = regionVertices(
      capturedVikinConfiguration.regions[0]!,
      8448,
      192,
      4608,
      192,
    );
    const second = regionVertices(
      capturedVikinConfiguration.regions[1]!,
      8448,
      192,
      3840,
      192,
    );
    expect(first.positions[0]).toBe(-1);
    expect(second.positions[0]).toBeCloseTo((4608 / 8448) * 2 - 1);
    expect(second.positions[2]).toBe(1);
  });

  it("accepts the explicitly clipped negative two-pixel edge", () => {
    const clipped = {
      ...identityConfiguration,
      regions: [
        {
          ...identityConfiguration.regions[0]!,
          destination: { x: -2, y: 0, width: 4, height: 2 },
          transform: {
            ...identityConfiguration.regions[0]!.transform,
            allowClipping: true,
          },
        },
      ],
    };
    expect(validatePerimeterMapping(clipped).valid).toBe(true);
  });

  it("deletes obsolete base and overlay textures on revision replacement", () => {
    vi.stubGlobal("WebGLRenderingContext", FakeWebGLRenderingContext);
    const canvas = document.createElement("canvas");
    const gl = new FakeWebGLRenderingContext();
    Object.defineProperty(canvas, "getContext", { value: () => gl });
    const renderer = new PerimeterWebGLRenderer(canvas, identityConfiguration);
    const image = {} as TexImageSource;
    renderer.render({ base: { screen: image }, overlay: { screen: image } });

    expect(
      renderer.replaceConfiguration({
        ...identityConfiguration,
        revision: "replacement",
      }),
    ).toBe(true);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    renderer.dispose();
    vi.unstubAllGlobals();
  });

  it("skips texImage2D for videos that have not decoded a frame yet", () => {
    vi.stubGlobal("WebGLRenderingContext", FakeWebGLRenderingContext);
    const canvas = document.createElement("canvas");
    const gl = new FakeWebGLRenderingContext();
    Object.defineProperty(canvas, "getContext", { value: () => gl });
    const renderer = new PerimeterWebGLRenderer(canvas, identityConfiguration);
    const video = document.createElement("video");
    Object.defineProperty(video, "readyState", { value: 0 });
    Object.defineProperty(video, "videoWidth", { value: 0 });
    Object.defineProperty(video, "videoHeight", { value: 0 });

    renderer.render({ base: { screen: video as unknown as TexImageSource } });

    expect(gl.texImage2D).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it("uploads video frames once the video has decoded data", () => {
    vi.stubGlobal("WebGLRenderingContext", FakeWebGLRenderingContext);
    const canvas = document.createElement("canvas");
    const gl = new FakeWebGLRenderingContext();
    Object.defineProperty(canvas, "getContext", { value: () => gl });
    const renderer = new PerimeterWebGLRenderer(canvas, identityConfiguration);
    const video = document.createElement("video");
    Object.defineProperty(video, "readyState", { value: 2 });
    Object.defineProperty(video, "videoWidth", { value: 4 });
    Object.defineProperty(video, "videoHeight", { value: 2 });

    renderer.render({ base: { screen: video as unknown as TexImageSource } });

    expect(gl.texImage2D).toHaveBeenCalledTimes(1);
    renderer.dispose();
  });

  it("skips and logs sources larger than the GPU max texture size once", () => {
    vi.stubGlobal("WebGLRenderingContext", FakeWebGLRenderingContext);
    const canvas = document.createElement("canvas");
    const gl = new FakeWebGLRenderingContext();
    Object.defineProperty(canvas, "getContext", { value: () => gl });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());
    const renderer = new PerimeterWebGLRenderer(canvas, identityConfiguration);
    const image = new Image();
    Object.defineProperty(image, "naturalWidth", { value: 8192 });
    Object.defineProperty(image, "naturalHeight", { value: 512 });

    renderer.render({ base: { screen: image } });
    renderer.render({ base: { screen: image } });

    expect(gl.texImage2D).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]![0]).toContain("8192x512");
    errorSpy.mockRestore();
    renderer.dispose();
  });

  it("skips zero-size sources without logging or uploading", () => {
    vi.stubGlobal("WebGLRenderingContext", FakeWebGLRenderingContext);
    const canvas = document.createElement("canvas");
    const gl = new FakeWebGLRenderingContext();
    Object.defineProperty(canvas, "getContext", { value: () => gl });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());
    const renderer = new PerimeterWebGLRenderer(canvas, identityConfiguration);
    const image = new Image();
    Object.defineProperty(image, "naturalWidth", { value: 0 });
    Object.defineProperty(image, "naturalHeight", { value: 0 });

    renderer.render({ base: { screen: image } });

    expect(gl.texImage2D).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    renderer.dispose();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
