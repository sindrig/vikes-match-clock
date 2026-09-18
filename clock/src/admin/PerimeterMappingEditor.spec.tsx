import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PerimeterDisplayConfig } from "../types";
import PerimeterMappingEditor from "./PerimeterMappingEditor";

const configuration: PerimeterDisplayConfig = {
  version: 1,
  revision: "published",
  renderer: "web",
  framebuffer: { width: 8, height: 4, background: "black" },
  logicalScreens: {
    screen: { id: "screen", name: "Screen", width: 8, height: 4 },
  },
  compatibilityKeys: { base: { "1": "screen" }, overlay: {} },
  regions: [
    {
      id: "region",
      logicalScreenId: "screen",
      source: { x: 0, y: 0, width: 8, height: 4 },
      destination: { x: 0, y: 0, width: 8, height: 4 },
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

describe("PerimeterMappingEditor", () => {
  it("keeps numeric edits local until Publish", () => {
    const onPublish = vi.fn<(value: typeof configuration) => void>();
    render(
      <PerimeterMappingEditor
        configuration={configuration}
        onPublish={onPublish}
      />,
    );

    fireEvent.change(screen.getByLabelText("destination x"), {
      target: { value: "2" },
    });
    expect(onPublish).not.toHaveBeenCalled();
    expect(screen.getByLabelText("destination x")).toHaveValue("2");
  });

  it("exposes draft framebuffer and transform controls without publishing", () => {
    const onPublish = vi.fn<(value: typeof configuration) => void>();
    render(
      <PerimeterMappingEditor
        configuration={configuration}
        onPublish={onPublish}
      />,
    );

    fireEvent.change(screen.getByLabelText("framebuffer width"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByText("Flip X"));

    expect(screen.getByLabelText("framebuffer width")).toHaveValue("10");
    expect(onPublish).not.toHaveBeenCalled();
  });

  it("publishes a complete valid document with a fresh revision", () => {
    const onPublish = vi.fn<(value: typeof configuration) => void>();
    render(
      <PerimeterMappingEditor
        configuration={configuration}
        onPublish={onPublish}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(onPublish.mock.calls[0]?.[0]).toMatchObject({
      version: 1,
      renderer: "web",
      regions: configuration.regions,
    });
    expect(onPublish.mock.calls[0]?.[0].revision).not.toBe("published");
  });

  it("shows identifiable calibration labels and supports templates", () => {
    render(
      <PerimeterMappingEditor
        configuration={configuration}
        onPublish={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Sýna prófunarmynstur" }),
    );
    expect(screen.getByTestId("calibration-labels")).toHaveTextContent(
      "region: screen source 0,0 -> destination 0,0",
    );

    fireEvent.click(screen.getByRole("button", { name: "Identity mapping" }));
    expect(screen.getByTestId("perimeter-output-view")).toBeInTheDocument();
  });
});
