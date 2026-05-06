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
import { ref, onValue, set } from "firebase/database";
import { database } from "../firebase";
import "./LocationsManager.css";

interface ScreenDef {
  key: string;
  name: string;
  fontSize: string;
  style: { width: number; height: number };
}

interface LocationConfig {
  homeTeam?: number;
}

interface LocationData {
  label: string;
  pitchIds: number[];
  config?: LocationConfig;
  screens: ScreenDef[];
}

type LocationsMap = Record<string, LocationData>;

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
        const data = snapshot.val() as Record<string, unknown> | null;
        if (data && typeof data === "object") {
          const parsed: LocationsMap = {};
          for (const [key, raw] of Object.entries(data)) {
            if (raw && typeof raw === "object") {
              const r = raw as Record<string, unknown>;
              const screens: ScreenDef[] = [];
              if (Array.isArray(r.screens)) {
                for (const s of r.screens) {
                  if (s && typeof s === "object") {
                    const sc = s as Record<string, unknown>;
                    const style =
                      sc.style && typeof sc.style === "object"
                        ? (sc.style as Record<string, unknown>)
                        : {};
                    screens.push({
                      key: typeof sc.key === "string" ? sc.key : "",
                      name: typeof sc.name === "string" ? sc.name : "",
                      fontSize:
                        typeof sc.fontSize === "string" ? sc.fontSize : "100%",
                      style: {
                        width: Number(style.width ?? 512),
                        height: Number(style.height ?? 400),
                      },
                    });
                  }
                }
              }
              const pitchIds: number[] = Array.isArray(r.pitchIds)
                ? (r.pitchIds as unknown[]).map(Number).filter((n) => !isNaN(n))
                : [];
              const config: LocationConfig | undefined =
                r.config && typeof r.config === "object"
                  ? (() => {
                      const c = r.config as Record<string, unknown>;
                      const cfg: LocationConfig = {};
                      if (typeof c.homeTeam === "number")
                        cfg.homeTeam = c.homeTeam;
                      return Object.keys(cfg).length > 0 ? cfg : undefined;
                    })()
                  : undefined;
              parsed[key] = {
                label:
                  typeof r.label === "string"
                    ? r.label
                    : typeof r.name === "string"
                      ? r.name
                      : key,
                pitchIds,
                config,
                screens,
              };
            }
          }
          setLocations(parsed);
        } else {
          setLocations({});
        }
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
  screen: ScreenDef;
  onChange: (updated: ScreenDef) => void;
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
            value={screen.fontSize}
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
  location: LocationData;
}) {
  const [label, setLabel] = useState(location.label);
  const [pitchIdsStr, setPitchIdsStr] = useState(location.pitchIds.join(", "));
  const [homeTeam, setHomeTeam] = useState<number | null>(
    location.config?.homeTeam ?? null,
  );
  const [screens, setScreens] = useState<ScreenDef[]>(location.screens);
  const [dirty, setDirty] = useState(false);

  const markDirty = useCallback(() => setDirty(true), []);

  const save = useCallback(() => {
    const pitchIds = pitchIdsStr
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);

    const config: LocationConfig = {};
    if (homeTeam !== null && homeTeam > 0) config.homeTeam = homeTeam;

    const data: Record<string, unknown> = {
      label,
      pitchIds,
      screens,
    };
    if (Object.keys(config).length > 0) {
      data.config = config;
    }

    const locRef = ref(database, `locations/${venueKey}`);
    void set(locRef, data);
    setDirty(false);
  }, [venueKey, label, pitchIdsStr, homeTeam, screens]);

  const addScreen = () => {
    const newScreen: ScreenDef = {
      key: "",
      name: "",
      fontSize: "100%",
      style: { width: 512, height: 400 },
    };
    setScreens([...screens, newScreen]);
    markDirty();
  };

  const updateScreen = (index: number, updated: ScreenDef) => {
    const next = [...screens];
    next[index] = updated;
    setScreens(next);
    markDirty();
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
              value={homeTeam ?? undefined}
              onChange={(val) => {
                setHomeTeam(val ? Number(val) : null);
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

        {screens.map((screen, i) => (
          <ScreenEditor
            key={i}
            screen={screen}
            onChange={(updated) => updateScreen(i, updated)}
          />
        ))}

        {dirty && (
          <Button
            appearance="primary"
            size="sm"
            onClick={save}
            style={{ marginTop: "0.75rem" }}
          >
            Vista breytingar
          </Button>
        )}
      </div>
    </Panel>
  );
}

function NewLocationModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
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
    label.trim().length > 0 &&
    screenKey.trim().length > 0;

  const handleSave = () => {
    const data: LocationData = {
      label: label.trim(),
      pitchIds: [],
      screens: [
        {
          key: screenKey.trim(),
          name: screenName.trim() || "Skjár",
          fontSize,
          style: { width, height },
        },
      ],
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
      />
    </div>
  );
}
