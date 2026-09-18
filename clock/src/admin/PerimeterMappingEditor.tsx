import { useState, type PointerEvent } from "react";
import { Button, Checkbox, InputNumber, Message } from "rsuite";
import type {
  PerimeterDisplayConfig,
  PerimeterRect,
  PerimeterRegion,
} from "../types";
import { validatePerimeterMapping } from "../perimeter/perimeterMapping";
import {
  applyHorizontalSplitTemplate,
  applyIdentityTemplate,
  calibrationLabels,
} from "../perimeter/templates";
import "./PerimeterMappingEditor.css";

interface Props {
  configuration: PerimeterDisplayConfig;
  onPublish: (configuration: PerimeterDisplayConfig) => void;
}

function updateRect(
  rect: PerimeterRect,
  key: keyof PerimeterRect,
  value: number | null,
): PerimeterRect {
  return { ...rect, [key]: value ?? 0 };
}

function numericValue(value: number | string | null): number {
  return value === null ? 0 : typeof value === "number" ? value : Number(value);
}

export default function PerimeterMappingEditor({
  configuration,
  onPublish,
}: Props) {
  const [draft, setDraft] = useState(configuration);
  const [selectedRegionId, setSelectedRegionId] = useState(
    configuration.regions[0]?.id ?? "",
  );
  const [calibration, setCalibration] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRegion = draft.regions.find(
    (region) => region.id === selectedRegionId,
  );

  const updateRegion = (updated: PerimeterRegion) => {
    setDraft((current) => ({
      ...current,
      regions: current.regions.map((region) =>
        region.id === updated.id ? updated : region,
      ),
    }));
    setError(null);
  };

  const updateScreen = (
    screenId: string,
    key: "width" | "height",
    value: number | string | null,
  ) => {
    setDraft((current) => {
      const screen = current.logicalScreens[screenId];
      if (!screen) return current;
      return {
        ...current,
        logicalScreens: {
          ...current.logicalScreens,
          [screenId]: {
            ...screen,
            [key]: numericValue(value),
          },
        },
      };
    });
    setError(null);
  };

  const updateFramebuffer = (
    key: "width" | "height",
    value: number | string | null,
  ) => {
    setDraft((current) => ({
      ...current,
      framebuffer: { ...current.framebuffer, [key]: numericValue(value) },
    }));
    setError(null);
  };

  const updateRegionGeometry = (
    region: PerimeterRegion,
    side: "source" | "destination",
    deltaX: number,
    deltaY: number,
    resize: boolean,
  ) => {
    const rect = region[side];
    updateRegion({
      ...region,
      [side]: {
        ...rect,
        ...(resize
          ? {
              width: Math.max(1, Math.round(rect.width + deltaX)),
              height: Math.max(1, Math.round(rect.height + deltaY)),
            }
          : {
              x: Math.round(rect.x + deltaX),
              y: Math.round(rect.y + deltaY),
            }),
      },
    });
  };

  const startPointerEdit = (
    event: PointerEvent<HTMLButtonElement>,
    region: PerimeterRegion,
    side: "source" | "destination",
    resize: boolean,
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds =
      event.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
    if (!bounds) return;
    const logicalWidth =
      side === "destination"
        ? draft.framebuffer.width
        : (draft.logicalScreens[region.logicalScreenId]?.width ?? 1);
    const logicalHeight =
      side === "destination"
        ? draft.framebuffer.height
        : (draft.logicalScreens[region.logicalScreenId]?.height ?? 1);
    const scaleX = logicalWidth / Math.max(bounds.width, 1);
    const scaleY = logicalHeight / Math.max(bounds.height, 1);
    const startX = event.clientX;
    const startY = event.clientY;
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      updateRegionGeometry(
        region,
        side,
        (moveEvent.clientX - startX) * scaleX,
        (moveEvent.clientY - startY) * scaleY,
        resize,
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const applyTemplate = (next: PerimeterDisplayConfig) => {
    setDraft(next);
    setSelectedRegionId(next.regions[0]?.id ?? "");
    setError(null);
  };

  const publish = () => {
    const result = validatePerimeterMapping(draft);
    if (!result.valid) {
      setError(result.errors.map((entry) => entry.message).join(" "));
      return;
    }
    onPublish({ ...draft, revision: crypto.randomUUID() });
  };

  return (
    <section className="perimeter-mapping-editor">
      <div className="perimeter-mapping-toolbar">
        <strong>Perimeter mapping</strong>
        <Button
          size="sm"
          appearance="ghost"
          onClick={() => setCalibration((value) => !value)}
        >
          {calibration ? "Fela prófunarmynstur" : "Sýna prófunarmynstur"}
        </Button>
        <Button size="sm" appearance="primary" onClick={publish}>
          Publish
        </Button>
      </div>
      {error && (
        <Message type="error" showIcon>
          {error}
        </Message>
      )}
      <div className="perimeter-mapping-global-controls">
        <strong>Framebuffer</strong>
        {(["width", "height"] as const).map((key) => (
          <InputNumber
            key={key}
            size="sm"
            value={draft.framebuffer[key]}
            aria-label={`framebuffer ${key}`}
            onChange={(value) => updateFramebuffer(key, value)}
          />
        ))}
        {Object.values(draft.logicalScreens).map((screen) => (
          <div key={screen.id} data-testid={`logical-screen-${screen.id}`}>
            <strong>{screen.name}</strong>
            {(["width", "height"] as const).map((key) => (
              <InputNumber
                key={key}
                size="sm"
                value={screen[key]}
                aria-label={`${screen.id} ${key}`}
                onChange={(value) => updateScreen(screen.id, key, value)}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="perimeter-mapping-canvas-row">
        <div
          className="perimeter-mapping-source-view"
          data-testid="perimeter-source-view"
        >
          <strong>Logical sources</strong>
          {draft.regions.map((region) => (
            <div
              key={region.id}
              className="perimeter-mapping-source-region"
              style={{
                width: `${
                  (region.source.width /
                    (draft.logicalScreens[region.logicalScreenId]?.width ??
                      1)) *
                  100
                }%`,
                height: `${
                  (region.source.height /
                    (draft.logicalScreens[region.logicalScreenId]?.height ??
                      1)) *
                  100
                }%`,
              }}
            >
              <button
                type="button"
                className={
                  region.id === selectedRegionId ? "selected" : undefined
                }
                onClick={() => setSelectedRegionId(region.id)}
                onPointerDown={(event) =>
                  startPointerEdit(event, region, "source", false)
                }
              >
                {region.id}
              </button>
              <button
                type="button"
                aria-label={`Resize ${region.id} source`}
                className="perimeter-mapping-resize-handle"
                onPointerDown={(event) =>
                  startPointerEdit(event, region, "source", true)
                }
              />
            </div>
          ))}
        </div>
        <div
          className="perimeter-mapping-output-view"
          data-testid="perimeter-output-view"
          style={{
            aspectRatio: `${draft.framebuffer.width} / ${draft.framebuffer.height}`,
          }}
        >
          {draft.regions.map((region) => (
            <div
              key={region.id}
              className={
                region.id === selectedRegionId ? "selected" : undefined
              }
              style={{
                left: `${(region.destination.x / draft.framebuffer.width) * 100}%`,
                top: `${(region.destination.y / draft.framebuffer.height) * 100}%`,
                width: `${(region.destination.width / draft.framebuffer.width) * 100}%`,
                height: `${(region.destination.height / draft.framebuffer.height) * 100}%`,
                zIndex: region.transform.zIndex,
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedRegionId(region.id)}
                onPointerDown={(event) =>
                  startPointerEdit(event, region, "destination", false)
                }
              >
                {calibration ? region.logicalScreenId : region.id}
              </button>
              <button
                type="button"
                aria-label={`Resize ${region.id} destination`}
                className="perimeter-mapping-resize-handle"
                onPointerDown={(event) =>
                  startPointerEdit(event, region, "destination", true)
                }
              />
            </div>
          ))}
        </div>
      </div>
      {selectedRegion && (
        <div
          className="perimeter-mapping-controls"
          data-testid="mapping-controls"
        >
          <strong>{selectedRegion.id}</strong>
          {(["source", "destination"] as const).map((side) => (
            <div key={side} className="perimeter-mapping-rect-controls">
              <span>{side}</span>
              {(["x", "y", "width", "height"] as const).map((key) => (
                <InputNumber
                  key={`${side}-${key}`}
                  size="sm"
                  value={selectedRegion[side][key]}
                  aria-label={`${side} ${key}`}
                  onChange={(value) =>
                    updateRegion({
                      ...selectedRegion,
                      [side]: updateRect(
                        selectedRegion[side],
                        key,
                        value === null
                          ? null
                          : typeof value === "number"
                            ? value
                            : Number(value),
                      ),
                    })
                  }
                />
              ))}
            </div>
          ))}
          <InputNumber
            size="sm"
            value={selectedRegion.transform.rotation}
            aria-label="rotation"
            onChange={(value) =>
              updateRegion({
                ...selectedRegion,
                transform: {
                  ...selectedRegion.transform,
                  rotation: (value ??
                    0) as PerimeterRegion["transform"]["rotation"],
                },
              })
            }
          />
          <InputNumber
            size="sm"
            value={selectedRegion.transform.zIndex}
            aria-label="z-index"
            onChange={(value) =>
              updateRegion({
                ...selectedRegion,
                transform: {
                  ...selectedRegion.transform,
                  zIndex:
                    value === null
                      ? 0
                      : typeof value === "number"
                        ? value
                        : Number(value),
                },
              })
            }
          />
          <div className="perimeter-mapping-transform-controls">
            <Checkbox
              checked={selectedRegion.transform.flipX}
              onChange={(_, checked) =>
                updateRegion({
                  ...selectedRegion,
                  transform: { ...selectedRegion.transform, flipX: checked },
                })
              }
            >
              Flip X
            </Checkbox>
            <Checkbox
              checked={selectedRegion.transform.flipY}
              onChange={(_, checked) =>
                updateRegion({
                  ...selectedRegion,
                  transform: { ...selectedRegion.transform, flipY: checked },
                })
              }
            >
              Flip Y
            </Checkbox>
            {(
              [
                ["allowScaling", "Allow scaling"],
                ["allowClipping", "Allow clipping"],
                ["allowSourceOverlap", "Allow source overlap"],
                ["allowDestinationOverlap", "Allow destination overlap"],
              ] as const
            ).map(([key, label]) => (
              <Checkbox
                key={key}
                checked={selectedRegion.transform[key]}
                onChange={(_, checked) =>
                  updateRegion({
                    ...selectedRegion,
                    transform: {
                      ...selectedRegion.transform,
                      [key]: checked,
                    },
                  })
                }
              >
                {label}
              </Checkbox>
            ))}
          </div>
        </div>
      )}
      <div className="perimeter-mapping-templates">
        <Button
          size="sm"
          onClick={() => {
            const screenId = selectedRegion?.logicalScreenId;
            if (!screenId) return;
            const screen = draft.logicalScreens[screenId];
            if (!screen) return;
            applyTemplate(
              applyIdentityTemplate(draft, screenId, {
                x: 0,
                y: 0,
                width: screen.width,
                height: screen.height,
              }),
            );
          }}
        >
          Identity mapping
        </Button>
        <Button
          size="sm"
          onClick={() => {
            const screenId = selectedRegion?.logicalScreenId;
            const screen = screenId
              ? draft.logicalScreens[screenId]
              : undefined;
            if (
              !screenId ||
              !screen ||
              draft.framebuffer.width < screen.width * 2
            )
              return;
            applyTemplate(
              applyHorizontalSplitTemplate(draft, screenId, [
                { x: 0, y: 0, width: screen.width / 2, height: screen.height },
                {
                  x: screen.width / 2,
                  y: 0,
                  width: screen.width / 2,
                  height: screen.height,
                },
              ]),
            );
          }}
        >
          Horizontal split
        </Button>
      </div>
      {calibration && (
        <pre data-testid="calibration-labels">
          {calibrationLabels(draft).join("\n")}
        </pre>
      )}
    </section>
  );
}
