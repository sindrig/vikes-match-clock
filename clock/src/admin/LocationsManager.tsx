import { useState, useEffect, useCallback } from "react";
import {
  Panel,
  Button,
  Input,
  InputNumber,
  Modal,
  IconButton,
  FlexboxGrid,
} from "rsuite";
import PlusIcon from "@rsuite/icons/Plus";
import { ref, onValue, set, update } from "firebase/database";
import { database } from "../firebase";
import { parseLocations } from "../contexts/firebaseParsers";
import { metadataUpdates, parsePitchIds, parseVenueId } from "../lib/venue";
import type { PerimeterDisplayConfig, Venue, VenueScreen } from "../types";
import PerimeterMappingEditor from "./PerimeterMappingEditor";
import "./LocationsManager.css";

type LocationsMap = Record<string, Venue>;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^-+|-+$/g, "");
}

function useLocationsData(): {
  locations: LocationsMap;
  loading: boolean;
  error: string | null;
} {
  const [locations, setLocations] = useState<LocationsMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const locRef = ref(database, "locations");
    const unsubscribe = onValue(
      locRef,
      (snapshot) => {
        setLocations(parseLocations(snapshot.val())?.venues ?? {});
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  return { locations, loading, error };
}

function ScreenEditor({
  screen,
  onChange,
}: {
  screen: VenueScreen;
  onChange: (updated: VenueScreen) => void;
}) {
  return (
    <div className="loc-screen-row">
      <FlexboxGrid align="middle" style={{ gap: "0.5rem" }}>
        <FlexboxGrid.Item colspan={5}>
          <Input
            size="sm"
            placeholder="Nafn"
            value={screen.name}
            onChange={(val) => onChange({ ...screen, name: val })}
          />
        </FlexboxGrid.Item>
        <FlexboxGrid.Item colspan={4}>
          <Input
            size="sm"
            placeholder="Lykill"
            value={screen.key}
            onChange={(val) => onChange({ ...screen, key: val })}
          />
        </FlexboxGrid.Item>
        <FlexboxGrid.Item colspan={4}>
          <Input
            size="sm"
            placeholder="Leturstærð"
            value={screen.fontSize ?? "100%"}
            onChange={(val) => onChange({ ...screen, fontSize: val })}
          />
        </FlexboxGrid.Item>
        <FlexboxGrid.Item colspan={4}>
          <InputNumber
            size="sm"
            prefix="W"
            value={screen.style.width}
            onChange={(val) =>
              onChange({
                ...screen,
                style: { ...screen.style, width: Number(val) || 0 },
              })
            }
          />
        </FlexboxGrid.Item>
        <FlexboxGrid.Item colspan={4}>
          <InputNumber
            size="sm"
            prefix="H"
            value={screen.style.height}
            onChange={(val) =>
              onChange({
                ...screen,
                style: { ...screen.style, height: Number(val) || 0 },
              })
            }
          />
        </FlexboxGrid.Item>
      </FlexboxGrid>
    </div>
  );
}

function LocationEditor({
  venueKey,
  location,
}: {
  venueKey: string;
  location: Venue;
}) {
  const [label, setLabel] = useState(location.label);
  const [pitchIdsStr, setPitchIdsStr] = useState(location.pitchIds.join(", "));
  const [homeTeam, setHomeTeam] = useState<number | string | null>(
    location.config.homeTeam ?? null,
  );
  const [screens, setScreens] = useState(location.screens);
  const [perimeterDisplay, setPerimeterDisplay] = useState(
    location.perimeterDisplay,
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const markDirty = useCallback(() => setDirty(true), []);

  const save = useCallback(
    async (publishedMapping?: PerimeterDisplayConfig) => {
      if (saving) return;
      const pitchValues = pitchIdsStr.trim() ? pitchIdsStr.split(",") : [];
      const homeTeamId = parseVenueId(homeTeam);
      if (
        (homeTeam !== null && homeTeamId === undefined) ||
        pitchValues.some((value) => parseVenueId(value) === undefined)
      ) {
        setSaveError("Auðkenni þurfa að vera jákvæðar heiltölur.");
        return;
      }
      const pitchIds = parsePitchIds(pitchValues);
      const changes: Record<string, unknown> = {
        ...metadataUpdates(location.label, label, "label"),
        ...metadataUpdates(
          location.config.homeTeam,
          homeTeamId,
          "config/homeTeam",
        ),
        ...metadataUpdates(
          location.screens,
          screens,
          "screens",
          location.document?.screens,
        ),
      };
      if (JSON.stringify(pitchIds) !== JSON.stringify(location.pitchIds)) {
        changes.pitchIds = pitchIds;
      }
      if (publishedMapping) {
        Object.assign(
          changes,
          metadataUpdates(
            location.perimeterDisplay,
            publishedMapping,
            "perimeterDisplay",
            location.document?.perimeterDisplay,
          ),
        );
      }

      setSaving(true);
      setSaveError(null);
      try {
        await update(ref(database, `locations/${venueKey}`), changes);
        setDirty(false);
        if (publishedMapping) setPerimeterDisplay(publishedMapping);
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : "Vistun mistókst.",
        );
      } finally {
        setSaving(false);
      }
    },
    [venueKey, location, label, pitchIdsStr, homeTeam, screens, saving],
  );

  const addScreen = () => {
    const newScreen: VenueScreen = {
      key: "",
      name: "",
      fontSize: "100%",
      style: { width: 512, height: 400 },
    };
    const index =
      Math.max(
        -1,
        ...Object.keys(screens).map(Number).filter(Number.isSafeInteger),
      ) + 1;
    setScreens({ ...screens, [index]: newScreen });
    markDirty();
  };

  const updateScreen = (key: string, updated: VenueScreen) => {
    setScreens({ ...screens, [key]: updated });
    markDirty();
  };

  // Bootstrap a perimeter mapping draft for a venue that has none, so the
  // mapping editor can be opened and published through the UI instead of a
  // hand-written Firebase document. The draft starts from the venue's first
  // screen as a single logical screen; admins adjust geometry, templates,
  // and the cue duration in the editor before publishing.
  const addPerimeterMapping = () => {
    const first = Object.values(screens)[0];
    const width = first?.style.width ?? 1024;
    const height = first?.style.height ?? 256;
    const screenId = first?.key.trim() || "skjar-1";
    setPerimeterDisplay({
      version: 1,
      revision: crypto.randomUUID(),
      renderer: "web",
      framebuffer: { width, height, background: "black" },
      logicalScreens: {
        [screenId]: {
          id: screenId,
          name: first?.name.trim() || "Skjár",
          width,
          height,
        },
      },
      compatibilityKeys: { base: {}, overlay: {} },
      regions: [],
      playback: { cueDurationMs: 20000, videoPolicy: "fit-to-cue" },
    });
  };

  return (
    <Panel
      header={
        <span>
          <strong>{location.label}</strong>{" "}
          <span className="loc-key-badge">{venueKey}</span>
        </span>
      }
      bordered
      collapsible
      className="loc-panel"
    >
      <div className="loc-fields">
        <FlexboxGrid
          align="middle"
          style={{ gap: "0.5rem", marginBottom: "0.5rem" }}
        >
          <FlexboxGrid.Item colspan={6}>
            <label className="loc-label">Heiti</label>
            <Input
              size="sm"
              aria-label="Heiti"
              value={label}
              onChange={(val) => {
                setLabel(val);
                markDirty();
              }}
            />
          </FlexboxGrid.Item>
          <FlexboxGrid.Item colspan={6}>
            <label className="loc-label">Völlur (pitchIds)</label>
            <Input
              size="sm"
              placeholder="102, 103"
              aria-label="Völlur (pitchIds)"
              value={pitchIdsStr}
              onChange={(val) => {
                setPitchIdsStr(val);
                markDirty();
              }}
            />
          </FlexboxGrid.Item>
          <FlexboxGrid.Item colspan={4}>
            <label className="loc-label">Heimalið (ID)</label>
            <InputNumber
              size="sm"
              aria-label="Heimalið (ID)"
              value={homeTeam ?? undefined}
              onChange={(val) => {
                setHomeTeam(val === "" ? null : val);
                markDirty();
              }}
            />
          </FlexboxGrid.Item>
        </FlexboxGrid>

        <div className="loc-screens-header">
          <strong>Skjáir</strong>
          <IconButton
            icon={<PlusIcon />}
            size="xs"
            appearance="ghost"
            onClick={addScreen}
          >
            Nýr skjár
          </IconButton>
        </div>

        <div className="loc-screens-labels">
          <FlexboxGrid style={{ gap: "0.5rem" }}>
            <FlexboxGrid.Item colspan={5}>
              <small>Nafn</small>
            </FlexboxGrid.Item>
            <FlexboxGrid.Item colspan={4}>
              <small>Lykill</small>
            </FlexboxGrid.Item>
            <FlexboxGrid.Item colspan={4}>
              <small>Leturstærð</small>
            </FlexboxGrid.Item>
            <FlexboxGrid.Item colspan={4}>
              <small>Breidd</small>
            </FlexboxGrid.Item>
            <FlexboxGrid.Item colspan={4}>
              <small>Hæð</small>
            </FlexboxGrid.Item>
          </FlexboxGrid>
        </div>

        {Object.entries(screens).map(([key, screen]) => (
          <ScreenEditor
            key={key}
            screen={screen}
            onChange={(updated) => updateScreen(key, updated)}
          />
        ))}

        {!perimeterDisplay && (
          <div className="loc-perimeter-add">
            <Button size="sm" appearance="ghost" onClick={addPerimeterMapping}>
              Nýtt perimeter mapping
            </Button>
            <small className="loc-hint">
              Býr til uppkast fyrir völlinn svo jáðarskjárinn sé settur upp í
              ritlinum og birt með „Vista breytingar“.
            </small>
          </div>
        )}

        {perimeterDisplay && (
          <PerimeterMappingEditor
            configuration={perimeterDisplay}
            onPublish={(published) => {
              void save(published);
            }}
          />
        )}

        {dirty && (
          <Button
            appearance="primary"
            size="sm"
            loading={saving}
            onClick={() => void save()}
            style={{ marginTop: "0.75rem" }}
          >
            Vista breytingar
          </Button>
        )}
        {saveError && <p role="alert">{saveError}</p>}
      </div>
    </Panel>
  );
}

function NewLocationModal({
  open,
  onClose,
  existingKeys,
}: {
  open: boolean;
  onClose: () => void;
  existingKeys: string[];
}) {
  const [label, setLabel] = useState("");
  const [venueKey, setVenueKey] = useState("");
  const [autoKey, setAutoKey] = useState(true);
  const [screenName, setScreenName] = useState("");
  const [screenKey, setScreenKey] = useState("");
  const [fontSize, setFontSize] = useState("100%");
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(400);

  const effectiveKey = autoKey ? slugify(label) : venueKey;

  const canSave =
    effectiveKey.length > 0 &&
    !existingKeys.includes(effectiveKey) &&
    label.trim().length > 0 &&
    screenKey.trim().length > 0;

  const handleSave = () => {
    const data: Venue = {
      label: label.trim(),
      pitchIds: [],
      config: {},
      screens: {
        "0": {
          key: screenKey.trim(),
          name: screenName.trim() || "Skjár",
          fontSize,
          style: { width, height },
        },
      },
    };
    const locRef = ref(database, `locations/${effectiveKey}`);
    void set(locRef, data);
    onClose();
    setLabel("");
    setVenueKey("");
    setScreenName("");
    setScreenKey("");
    setFontSize("100%");
    setWidth(512);
    setHeight(400);
    setAutoKey(true);
  };

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <Modal.Header>
        <Modal.Title>Ný staðsetning</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="loc-modal-fields">
          <label className="loc-label">Heiti</label>
          <Input
            value={label}
            onChange={(val) => {
              setLabel(val);
              if (autoKey) setVenueKey(slugify(val));
            }}
            placeholder="t.d. Víkin úti"
          />

          <label className="loc-label">Lykill (slug)</label>
          <Input
            value={autoKey ? slugify(label) : venueKey}
            onChange={(val) => {
              setAutoKey(false);
              setVenueKey(val);
            }}
            placeholder="vikuti"
          />

          <hr />
          <strong>Fyrsti skjár</strong>

          <label className="loc-label">Nafn skjás</label>
          <Input
            value={screenName}
            onChange={setScreenName}
            placeholder="Skjár"
          />

          <label className="loc-label">Lykill skjás</label>
          <Input
            value={screenKey}
            onChange={setScreenKey}
            placeholder="outside"
          />

          <FlexboxGrid style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
            <FlexboxGrid.Item colspan={8}>
              <label className="loc-label">Leturstærð</label>
              <Input value={fontSize} onChange={setFontSize} size="sm" />
            </FlexboxGrid.Item>
            <FlexboxGrid.Item colspan={8}>
              <label className="loc-label">Breidd</label>
              <InputNumber
                value={width}
                onChange={(val) => setWidth(Number(val) || 512)}
                size="sm"
              />
            </FlexboxGrid.Item>
            <FlexboxGrid.Item colspan={8}>
              <label className="loc-label">Hæð</label>
              <InputNumber
                value={height}
                onChange={(val) => setHeight(Number(val) || 400)}
                size="sm"
              />
            </FlexboxGrid.Item>
          </FlexboxGrid>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button appearance="primary" onClick={handleSave} disabled={!canSave}>
          Búa til
        </Button>
        <Button appearance="subtle" onClick={onClose}>
          Hætta við
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export function LocationsManager() {
  const { locations, loading, error } = useLocationsData();
  const [showNewModal, setShowNewModal] = useState(false);

  if (loading) {
    return (
      <p style={{ padding: "1rem", color: "#999" }}>Hleð staðsetningum...</p>
    );
  }

  if (error) {
    return <p style={{ padding: "1rem", color: "red" }}>{error}</p>;
  }

  const entries = Object.entries(locations).sort((a, b) =>
    a[1].label.localeCompare(b[1].label, "is"),
  );

  return (
    <div className="loc-manager">
      <div className="loc-toolbar">
        <Button
          appearance="primary"
          size="sm"
          startIcon={<PlusIcon />}
          onClick={() => setShowNewModal(true)}
        >
          Ný staðsetning
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="admin-table-empty">Engar staðsetningar skráðar</p>
      ) : (
        entries.map(([key, loc]) => (
          <LocationEditor
            key={`${key}-${JSON.stringify(loc)}`}
            venueKey={key}
            location={loc}
          />
        ))
      )}

      <NewLocationModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        existingKeys={Object.keys(locations)}
      />
    </div>
  );
}
