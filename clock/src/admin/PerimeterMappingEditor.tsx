import { useState } from "react";
import { Button, InputNumber, Message } from "rsuite";
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
      <div className="perimeter-mapping-canvas-row">
        <div
          className="perimeter-mapping-source-view"
          data-testid="perimeter-source-view"
        >
          <strong>Logical sources</strong>
          {draft.regions.map((region) => (
            <button
              type="button"
              key={region.id}
              className={
                region.id === selectedRegionId ? "selected" : undefined
              }
              onClick={() => setSelectedRegionId(region.id)}
            >
              {region.id}
            </button>
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
            <button
              type="button"
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
              onClick={() => setSelectedRegionId(region.id)}
            >
              {calibration ? region.logicalScreenId : region.id}
            </button>
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
