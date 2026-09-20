import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Loader, Modal, IconButton, Badge, InputNumber } from "rsuite";
import CloseIcon from "@rsuite/icons/Close";
import PlusIcon from "@rsuite/icons/Plus";
import DragIcon from "@rsuite/icons/Dragable";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  UniqueIdentifier,
  closestCenter,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  PerimeterAdLayout,
  PerimeterAdLayoutColumn,
  PerimeterAdLayoutFile,
  PerimeterAppliedAdFile,
  PerimeterOverlayFile,
  ScorerCelebrationStyle,
} from "../types";
import { useListeners, usePerimeter } from "../contexts/FirebaseStateContext";
import { useLocalState } from "../contexts/LocalStateContext";
import { validateAdFileName } from "../contexts/firebaseParsers";
import GoalScorerPreparation from "./GoalScorerPreparation";
import PerimeterDisplayReports from "./PerimeterDisplayReports";
import PerimeterFileThumb from "./PerimeterFileThumb";
import {
  storageHelpers,
  ListResult,
  FIREBASE_STORAGE_BUCKET,
} from "../firebase";
import "./PerimeterControl.css";

const STALE_MS = 15 * 60 * 1000;
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
const MAX_AD_COLUMNS = 20;

const PHASE_LABELS: Record<string, string> = {
  loading: "Hleður",
  playing: "Spilar",
  error: "Villa",
  idle: "Í bið",
};

const BRIGHTNESS_PHASE_LABELS: Record<string, string> = {
  pending: "Í bið",
  applied: "Vistað",
  failed: "Villa",
};

const formatTimestamp = (updatedAt: number | null): string => {
  if (updatedAt === null) return "";
  return new Date(updatedAt).toLocaleTimeString("is-IS", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

interface SortableColumnProps {
  column: PerimeterAdLayoutColumn;
  columnIndex: number;
  lanes: { id: string; name: string }[];
  appliedFiles: Record<string, PerimeterAppliedAdFile> | undefined;
  onDelete: (columnId: string) => void;
  disabled?: boolean;
}

const SortableColumn = ({
  column,
  columnIndex,
  lanes,
  appliedFiles,
  onDelete,
  disabled,
}: SortableColumnProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : ("auto" as const),
  };

  return (
    <div ref={setNodeRef} style={style} className="perimeter-sortable-column">
      <div className="perimeter-column-card">
        <div className="perimeter-column-header">
          <span
            className="perimeter-drag-handle"
            {...attributes}
            {...listeners}
          >
            <DragIcon />
          </span>
          <span className="perimeter-column-index">
            Dálkur {columnIndex + 1}
          </span>
          <IconButton
            icon={<CloseIcon />}
            size="xs"
            appearance="subtle"
            color="red"
            aria-label={`Fjarlægja dálk ${columnIndex + 1}`}
            onClick={() => onDelete(column.id)}
            disabled={disabled}
            className="perimeter-delete-btn"
          />
        </div>
        <div className="perimeter-column-files">
          {lanes.map((lane) => {
            const file = column.files[lane.id];
            const applied = appliedFiles?.[lane.id];
            return (
              <div key={lane.id} className="perimeter-file-card">
                <div className="perimeter-file-lane-label">{lane.name}</div>
                {file ? (
                  <>
                    <PerimeterFileThumb
                      name={applied?.name ?? file.name}
                      source={file.source}
                      appliedThumbnail={applied?.thumbnail}
                    />
                    <div
                      className="perimeter-file-name"
                      title={applied?.name ?? file.name}
                    >
                      {applied?.name ?? file.name}
                    </div>
                  </>
                ) : (
                  <div className="perimeter-file-empty">
                    <span>Engin skrá</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface FilePickerProps {
  laneName: string;
  listenPrefix: string;
  selectedFile: PerimeterAdLayoutFile | null;
  onSelect: (file: PerimeterAdLayoutFile) => void;
}

const FilePicker = ({
  laneName,
  listenPrefix,
  selectedFile,
  onSelect,
}: FilePickerProps) => {
  const [files, setFiles] = useState<
    Array<{ name: string; generation?: string }>
  >([]);
  const [listing, setListing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const storagePath = `${listenPrefix}/perimeter/`;

  const loadFiles = useCallback(async () => {
    setListing(true);
    try {
      const result: ListResult = await storageHelpers.listAll(storagePath);
      // The daemon and parsers enforce strict filename rules; hide objects
      // that could never be selected into a valid layout.
      const listedFiles = await Promise.all(
        result.items
          .filter((item) => validateAdFileName(item.name))
          .map(async (item) => {
            if (typeof storageHelpers.getMetadata !== "function") {
              return { name: item.name };
            }
            try {
              const metadata = await storageHelpers.getMetadata(item.fullPath);
              return { name: item.name, generation: metadata.generation };
            } catch {
              return { name: item.name };
            }
          }),
      );
      setFiles(listedFiles.sort((a, b) => a.name.localeCompare(b.name, "is")));
    } catch {
      setFiles([]);
    } finally {
      setListing(false);
    }
  }, [storagePath]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size === 0) {
      window.alert("Skrá er tóm.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      window.alert("Skrá er of stór (max 250 MB)");
      event.target.value = "";
      return;
    }
    if (!validateAdFileName(file.name)) {
      window.alert(
        'Skráarnafn er óleyfilegt fyrir jaðarskjá (bara venjuleg skráarnöfn, ekkert % \\ / : * ? " < > |).',
      );
      event.target.value = "";
      return;
    }
    setUploading(true);
    storageHelpers
      .uploadBytes(`${storagePath}${file.name}`, file)
      .then(() => loadFiles())
      .catch(() => {
        // Upload failed — user will see the existing file list unchanged
      })
      .finally(() => {
        setUploading(false);
      });
  };

  const makeGsUri = (filename: string) =>
    `gs://${FIREBASE_STORAGE_BUCKET}/${storagePath}${filename}`;

  return (
    <div className="perimeter-file-picker">
      <div className="perimeter-file-picker-label">{laneName}</div>
      <div className="perimeter-file-list">
        {listing ? (
          <div className="perimeter-file-picker-loading">
            <Loader size="sm" content="Sæki skrár..." />
          </div>
        ) : files.length === 0 ? (
          <div className="perimeter-file-picker-empty">Engar skrár fundust</div>
        ) : (
          files.map((f) => (
            <button
              key={f.name}
              type="button"
              className={`perimeter-file-option${
                selectedFile?.name === f.name ? " selected" : ""
              }`}
              onClick={() =>
                onSelect({
                  name: f.name,
                  source: makeGsUri(f.name),
                  ...(f.generation ? { generation: f.generation } : {}),
                })
              }
            >
              <PerimeterFileThumb
                name={f.name}
                source={makeGsUri(f.name)}
                variant="option"
              />
              <span className="perimeter-file-option-name">{f.name}</span>
            </button>
          ))
        )}
      </div>
      <div className="perimeter-file-picker-upload">
        <label className="perimeter-upload-btn">
          {uploading ? "Hleður upp..." : "Hlaða upp"}
          <input
            type="file"
            accept="video/*,image/*"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>
    </div>
  );
};

// Canonical home-goal overlay targets. The keys are the shared overlay layer
// ids consumed by both the web runtime (via the published mapping's
// compatibilityKeys.overlay) and the Resolume daemon; labels fall back to the
// established 48/40 screen names when no web mapping is published.
const GOAL_VIDEO_TARGETS = [
  { key: "2", fallbackLabel: "48 skjáir" },
  { key: "4", fallbackLabel: "40 skjáir" },
] as const;

const GoalVideoSection = () => {
  const { goalVideo, setPerimeterGoalVideo } = usePerimeter();
  const { listenPrefix } = useLocalState();
  const { screens } = useListeners();

  const [showEdit, setShowEdit] = useState(false);
  const [draft, setDraft] = useState<Record<string, PerimeterOverlayFile>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perimeterConfiguration = useMemo(
    () =>
      screens.find((screen) => screen.key === listenPrefix)?.perimeterDisplay,
    [listenPrefix, screens],
  );
  const targets = useMemo(
    () =>
      GOAL_VIDEO_TARGETS.map(({ key, fallbackLabel }) => ({
        key,
        label:
          perimeterConfiguration?.logicalScreens[
            perimeterConfiguration?.compatibilityKeys.overlay?.[key] ?? ""
          ]?.name ?? fallbackLabel,
      })),
    [perimeterConfiguration],
  );

  const configuredFiles = goalVideo?.files ?? {};
  const configuredNames = GOAL_VIDEO_TARGETS.map(
    ({ key }) => configuredFiles[key]?.name ?? null,
  );

  const openEdit = () => {
    setError(null);
    setDraft({ ...configuredFiles });
    setShowEdit(true);
  };

  const closeEdit = () => {
    if (saving) return;
    setShowEdit(false);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!GOAL_VIDEO_TARGETS.every(({ key }) => draft[key] !== undefined)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setPerimeterGoalVideo({ files: { ...draft } });
      setShowEdit(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ekki tókst að vista markmyndband. Reyndu aftur.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (saving) return;
    if (
      !window.confirm(
        "Hreinsa markmyndband? Markahnappurinn notar þá sjálfgefnu goal-48/goal-40 skrárnar.",
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setPerimeterGoalVideo(null);
      setShowEdit(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ekki tókst að hreinsa markmyndband. Reyndu aftur.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="perimeter-goal-video">
      <div className="perimeter-brightness-header">
        <span className="perimeter-brightness-title">Markamyndband</span>
      </div>
      <div className="perimeter-goal-video-files">
        {configuredNames.every((name) => name === null) ? (
          <span className="perimeter-goal-video-empty">
            Ekkert stillt — markið notar goal-48/goal-40 skrárnar
          </span>
        ) : (
          targets.map(({ key, label }) => (
            <span key={key} className="perimeter-goal-video-file">
              {label}: {configuredFiles[key]?.name ?? "—"}
            </span>
          ))
        )}
      </div>
      {error && (
        <span className="perimeter-status-error">
          Ekki tókst að vista: {error}
        </span>
      )}
      <div className="perimeter-goal-video-actions">
        <Button size="sm" appearance="primary" onClick={openEdit}>
          {configuredNames.every((name) => name === null)
            ? "Stilla markmyndband"
            : "Breyta"}
        </Button>
      </div>
      <p className="perimeter-hint">
        Þegar mark er skorað spilar þetta efni á jaðarskjánum þar til
        markaskorari er valinn. Skrárnar eru valdar úr sama myndefnisgeymi og
        auglýsingadálkar.
      </p>
      <Modal open={showEdit} onClose={closeEdit} size="sm">
        <Modal.Header>
          <Modal.Title>Markamyndband</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="perimeter-add-hint">
            Veldu skrá fyrir hvern jaðarskjá úr listanum eða hlaðið upp nýrri
            skrá.
          </p>
          <div className="perimeter-add-form">
            {targets.map(({ key, label }) => (
              <FilePicker
                key={key}
                laneName={label}
                listenPrefix={listenPrefix}
                selectedFile={draft[key] ?? null}
                onSelect={(file) =>
                  setDraft((prev) => ({ ...prev, [key]: file }))
                }
              />
            ))}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            appearance="primary"
            onClick={() => {
              void handleSave();
            }}
            disabled={
              saving || !GOAL_VIDEO_TARGETS.every(({ key }) => draft[key])
            }
          >
            Vista
          </Button>
          {configuredNames.some((name) => name !== null) && (
            <Button
              appearance="ghost"
              color="red"
              onClick={() => {
                void handleClear();
              }}
              disabled={saving}
            >
              Hreinsa stillingu
            </Button>
          )}
          <Button onClick={closeEdit} disabled={saving}>
            Hætta við
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

const BrightnessSection = () => {
  const { brightness, brightnessStatus, setPerimeterBrightness } =
    usePerimeter();
  // Local edit draft: `null` means "untouched" (display the synced Firebase
  // value), `""` means the user explicitly cleared the input (display
  // blank, distinct from "untouched" so clearing never silently reverts to
  // showing the synced value again), and a number is an in-progress edit.
  // Firebase is the only source of the displayed *requested* value; the
  // draft only feeds the apply action and client-side validation.
  const [draft, setDraft] = useState<number | "" | null>(null);
  // The submitted percentage whose write is still settling. A write settles
  // only once the brightness subscription reflects the submitted value (no
  // optimistic local state); a rejected write clears it so the UI is not
  // stuck disabled forever.
  const [submittedValue, setSubmittedValue] = useState<number | null>(null);

  const valid =
    typeof draft === "number" &&
    Number.isInteger(draft) &&
    draft >= 0 &&
    draft <= 100;

  const phase = brightnessStatus?.phase;
  // A write has settled once the brightness subscription reflects the
  // submitted value; `busy` (not a raw `submittedValue !== null` check) is
  // what gates further submissions, so a later Vista click is never
  // permanently blocked by a stale submission once it settles — no effect
  // needed to reset submittedValue back to null.
  const settling = submittedValue !== null && brightness !== submittedValue;
  const busy = settling || phase === "pending";

  const handleApply = () => {
    if (typeof draft !== "number" || !valid || busy) return;
    setSubmittedValue(draft);
    setPerimeterBrightness(draft).catch(() => setSubmittedValue(null));
  };

  return (
    <div className="perimeter-brightness">
      <div className="perimeter-brightness-header">
        <span className="perimeter-brightness-title">
          Bjartleiki jaðarskjás
        </span>
        {brightnessStatus && (
          <Badge
            content={BRIGHTNESS_PHASE_LABELS[phase ?? ""] ?? phase}
            className={`perimeter-phase-badge phase-${phase}`}
          />
        )}
      </div>
      <div className="perimeter-brightness-controls">
        <InputNumber
          size="sm"
          step={1}
          aria-label="Bjartleiki jaðarskjás"
          // An absent brightness stays blank rather than defaulting to 0 —
          // defaulting would make a cleared/unset input look like a valid 0%
          // value and risk an accidental full-dim submission.
          value={draft === null ? (brightness ?? "") : draft}
          onChange={(val) => {
            if (val === "" || val === null || val === undefined) {
              setDraft("");
              return;
            }
            const next = typeof val === "number" ? val : Number(val);
            setDraft(Number.isNaN(next) ? null : next);
          }}
          disabled={busy}
        />
        <Button
          size="sm"
          appearance="primary"
          onClick={handleApply}
          disabled={!valid || busy}
        >
          Vista
        </Button>
      </div>
      {draft !== null && !valid && (
        <div className="perimeter-brightness-invalid">
          Heiltala á milli 0 og 100 er leyfileg.
        </div>
      )}
      <div className="perimeter-brightness-status">
        {brightness !== null && (
          <span className="perimeter-brightness-requested">
            Óskað: {brightness}%
          </span>
        )}
        {brightnessStatus?.appliedPercent !== null &&
          brightnessStatus?.appliedPercent !== undefined && (
            <span className="perimeter-brightness-applied">
              Staðfest: {brightnessStatus.appliedPercent}%
            </span>
          )}
        {brightnessStatus?.error && (
          <span className="perimeter-brightness-invalid">
            {brightnessStatus.error}
          </span>
        )}
      </div>
      <p className="perimeter-hint">
        Stillingin er send í gegnum Firebase og beitt af jaðartölvunni (Vnnox) á
        jaðarskjáinn.
      </p>
    </div>
  );
};

// Goal-scorer celebration presentations for web perimeter displays. The
// keys are the ScorerCelebrationStyle values; the default style is applied
// by the display runtime whenever the field is absent or invalid, so the
// selector marks it active even before an explicit write exists.
const SCORER_CELEBRATION_LABELS: Record<ScorerCelebrationStyle, string> = {
  ribbon: "Sjálfgefið",
  tunnel: "MARK borði",
  wave: "Bylgja",
  procession: "Hreyfandi borði",
  cutout: "Leikmannsáhersla",
};

const SCORER_CELEBRATION_ORDER: ScorerCelebrationStyle[] = [
  "ribbon",
  "tunnel",
  "wave",
  "procession",
  "cutout",
];

const ScorerCelebrationSection = () => {
  const { perimeter, setPerimeterScorerCelebration } = usePerimeter();
  const selected: ScorerCelebrationStyle =
    perimeter.scorerCelebration ?? "ribbon";
  const [savingStyle, setSavingStyle] = useState<ScorerCelebrationStyle | null>(
    null,
  );
  // The write settles once the perimeter subscription reflects the chosen
  // style (no optimistic local state); a rejected write clears the pending
  // flag so another selection is possible.
  const settling = savingStyle !== null && selected !== savingStyle;

  const handleSelect = (style: ScorerCelebrationStyle) => {
    if (settling) return;
    setSavingStyle(style);
    setPerimeterScorerCelebration(style)
      .catch(() => setSavingStyle(null))
      .finally(() => {
        setSavingStyle((current) => (current === style ? null : current));
      });
  };

  return (
    <div className="perimeter-scorer-celebration">
      <div className="perimeter-brightness-header">
        <span className="perimeter-brightness-title">Markasvör</span>
      </div>
      <div className="perimeter-scorer-celebration-options" role="radiogroup">
        {SCORER_CELEBRATION_ORDER.map((style) => (
          <Button
            key={style}
            size="sm"
            appearance={style === selected ? "primary" : "ghost"}
            active={style === selected}
            onClick={() => handleSelect(style)}
            disabled={settling}
            aria-pressed={style === selected}
          >
            {SCORER_CELEBRATION_LABELS[style]}
          </Button>
        ))}
      </div>
      {settling && (
        <span className="perimeter-scorer-celebration-status">Vistar…</span>
      )}
      <p className="perimeter-hint">
        Birtingin sem spilar á jaðarskjánum þegar markaskorari er valinn. Sem
        sjálfgefið er rauða kraftborðið; hinar stílnir setja stóran MARK texta,
        bylgjuáberingu, hreyfingu eða leikmannsáherslu í fokus. Breytingin
        beitist strax á lífandi borðanum.
      </p>
    </div>
  );
};

const PerimeterControl = ({ standalone = false }: { standalone?: boolean }) => {
  const {
    perimeter,
    getServerTime,
    setPerimeterState,
    skipPerimeterCue,
    restartPerimeterDisplays,
    setPerimeterAdLayout,
    adLayout,
    appliedAdLayout,
    appliedAdLayoutLoaded,
    appliedAdLayoutError,
  } = usePerimeter();
  const { listenPrefix } = useLocalState();
  const { screens } = useListeners();

  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addSelections, setAddSelections] = useState<
    Record<string, PerimeterAdLayoutFile>
  >({});
  const [activeDragId, setActiveDragId] = useState<UniqueIdentifier | null>(
    null,
  );
  const [writePending, setWritePending] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const perimeterConfiguration = useMemo(
    () =>
      screens.find((screen) => screen.key === listenPrefix)?.perimeterDisplay,
    [listenPrefix, screens],
  );
  const isWebVenue = perimeterConfiguration?.renderer === "web";
  const webLanes = useMemo(
    () =>
      Object.entries(perimeterConfiguration?.compatibilityKeys.base ?? {}).map(
        ([id, logicalScreenId]) => ({
          id,
          name:
            perimeterConfiguration?.logicalScreens[logicalScreenId]?.name ?? id,
        }),
      ),
    [perimeterConfiguration],
  );
  const lanes = appliedAdLayout?.lanes ?? (isWebVenue ? webLanes : []);
  const columns = useMemo(() => adLayout?.columns ?? [], [adLayout?.columns]);
  const appliedColumnsMap = useMemo(() => {
    const map: Record<
      string,
      { files: Record<string, PerimeterAppliedAdFile> }
    > = {};
    for (const col of appliedAdLayout?.columns ?? []) {
      map[col.id] = { files: col.files };
    }
    return map;
  }, [appliedAdLayout?.columns]);

  // Mutating handlers read the latest desired columns through this ref so a
  // write that is still settling (the Firebase subscription has not yet caught
  // up) can never clobber a newer layout computed from stale state.
  const columnsRef = useRef(columns);
  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  const adLayoutRef = useRef(adLayout);
  useEffect(() => {
    adLayoutRef.current = adLayout;
  }, [adLayout]);

  // Serialize layout writes: each revision is written only after the previous
  // one settles, preserving last-write-wins ordering.
  const writeQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  // The revision that was current when the in-flight write began. Mutating
  // controls stay disabled until the desired subscription moves past it.
  const beforeRevisionRef = useRef<string | null>(null);

  const revisionMismatch =
    !isWebVenue &&
    adLayout?.revision !== undefined &&
    appliedAdLayout?.revision !== undefined &&
    adLayout.revision !== appliedAdLayout.revision;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const writeLayout = (cols: PerimeterAdLayoutColumn[]): Promise<boolean> => {
    const run = writeQueueRef.current.then(async () => {
      beforeRevisionRef.current = adLayoutRef.current?.revision ?? null;
      setWritePending(true);
      setWriteError(null);
      try {
        const layout: PerimeterAdLayout = {
          version: 1,
          revision: crypto.randomUUID(),
          columns: cols,
        };
        await setPerimeterAdLayout(layout);
        return true;
      } catch (err) {
        beforeRevisionRef.current = null;
        setWriteError(
          typeof err === "string"
            ? err
            : err instanceof Error
              ? err.message
              : String(err),
        );
        return false;
      } finally {
        setWritePending(false);
      }
    });
    writeQueueRef.current = run.then(
      () => true,
      () => true,
    );
    return run;
  };

  const openDialog = () => {
    setNow(getServerTime());
    setOpen(true);
    setShowAddDialog(false);
    setAddSelections({});
    setWriteError(null);
    beforeRevisionRef.current = null;
  };

  // Controls stay disabled while a write is in flight AND until the desired
  // subscription confirms it (the Firebase-backed columns have advanced past
  // the revision that was current when the write started).
  const writeSettling =
    beforeRevisionRef.current !== null &&
    adLayout?.revision === beforeRevisionRef.current;
  const busy = writePending || writeSettling;

  const isStale =
    now > 0 &&
    !isWebVenue &&
    appliedAdLayout?.updatedAt != null &&
    now - appliedAdLayout.updatedAt > STALE_MS;

  const handleDragStart = (event: DragStartEvent) => {
    if (busy) return;
    setActiveDragId(event.active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const current = columnsRef.current;
    const oldIndex = current.findIndex((c) => c.id === active.id);
    const newIndex = current.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(current, oldIndex, newIndex);
    void writeLayout(reordered);
  };

  const handleDeleteColumn = (columnId: string) => {
    if (
      !window.confirm(
        "Fjarlægja dálk? Skrárnar verða áfram í Firebase Storage.",
      )
    ) {
      return;
    }
    const remaining = columnsRef.current.filter((c) => c.id !== columnId);
    void writeLayout(remaining);
  };

  const handleAddColumn = async () => {
    const allSelected = lanes.every(
      (lane) => addSelections[lane.id] !== undefined,
    );
    if (!allSelected) return;
    if (columnsRef.current.length >= MAX_AD_COLUMNS) return;

    const newColumn: PerimeterAdLayoutColumn = {
      id: crypto.randomUUID(),
      files: { ...addSelections },
    };
    const updated = [...columnsRef.current, newColumn];
    const ok = await writeLayout(updated);
    if (ok) {
      setShowAddDialog(false);
      setAddSelections({});
    }
  };

  const activeDragColumn = activeDragId
    ? columns.find((c) => c.id === activeDragId)
    : null;

  const lanesConfigured = lanes.length > 0;

  if (!perimeter.enabled) return null;

  const contents = (
    <>
      {isWebVenue && <PerimeterDisplayReports />}
      <BrightnessSection />
      <GoalVideoSection />
      {isWebVenue && <ScorerCelebrationSection />}
      {!isWebVenue && <GoalScorerPreparation />}
      {!isWebVenue && !appliedAdLayoutLoaded ? (
        <div className="perimeter-preview-state">
          <Loader content="Sæki forskoðun..." />
          <p className="perimeter-hint">
            Forskoðunin er sjálfkrafa sótt þegar daemoninn ræsir og eftir að
            jaðarskjárinn er kveiktur.
          </p>
        </div>
      ) : !isWebVenue && appliedAdLayout === undefined ? (
        appliedAdLayoutError ? (
          <div className="perimeter-error-state">
            <div className="perimeter-error-badge">Villa</div>
            <p className="perimeter-error-message">{appliedAdLayoutError}</p>
          </div>
        ) : (
          <div className="perimeter-preview-state">
            <p className="perimeter-empty-text">
              Engin forskoðun hefur verið birt enn.
            </p>
            <p className="perimeter-hint">
              Forskoðunin er sjálfkrafa sótt þegar daemoninn ræsir og eftir að
              jaðarskjárinn er kveiktur.
            </p>
          </div>
        )
      ) : (
        <div className="perimeter-layout-board">
          {/* Status Bar */}
          <div className="perimeter-status-bar">
            {isWebVenue ? (
              <Badge
                content="Web"
                className="perimeter-phase-badge phase-playing"
              />
            ) : (
              <Badge
                content={
                  PHASE_LABELS[appliedAdLayout?.phase ?? "idle"] ??
                  appliedAdLayout?.phase
                }
                className={`perimeter-phase-badge phase-${appliedAdLayout?.phase ?? "idle"}`}
              />
            )}
            {!isWebVenue && appliedAdLayout?.error && (
              <span className="perimeter-status-error">
                {appliedAdLayout?.error}
              </span>
            )}
            {writeError && (
              <span className="perimeter-status-error">
                Ekki tókst að vista: {writeError}
              </span>
            )}
            <span className="perimeter-lanes-count">
              {lanes.length} {lanes.length === 1 ? "röð" : "raðir"}
            </span>
            {revisionMismatch && (
              <span className="perimeter-revision-pending">
                Uppfærslu beðið
              </span>
            )}
            {!isWebVenue && !revisionMismatch && appliedAdLayout?.revision && (
              <span className="perimeter-revision-live">Lifandi</span>
            )}
          </div>

          {isStale && (
            <div className="perimeter-stale">
              Staða jaðarskjás er gömul (uppfærð kl.{" "}
              {formatTimestamp(appliedAdLayout?.updatedAt ?? null)}).
            </div>
          )}

          {!lanesConfigured ? (
            <div className="perimeter-no-lanes">
              <p className="perimeter-empty-text">
                Engar raðir eru stilltar fyrir jaðarskjáinn.
              </p>
              <p className="perimeter-hint">
                Raðir eru skilgreindar í stillingum daemonins.
              </p>
            </div>
          ) : columns.length === 0 ? (
            <div className="perimeter-empty-columns">
              <p className="perimeter-empty-text">
                Engir dálkar í jaðarskjánum.
              </p>
              <Button
                appearance="primary"
                onClick={() => {
                  setAddSelections({});
                  setShowAddDialog(true);
                }}
                disabled={busy}
              >
                Bæta við dálki
              </Button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="perimeter-columns-scroll">
                <SortableContext
                  items={columns.map((c) => c.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {columns.map((column, idx) => {
                    const appliedCol = appliedColumnsMap[column.id];
                    return (
                      <SortableColumn
                        key={column.id}
                        column={column}
                        columnIndex={idx}
                        lanes={lanes}
                        appliedFiles={appliedCol?.files}
                        onDelete={handleDeleteColumn}
                        disabled={busy}
                      />
                    );
                  })}
                </SortableContext>
              </div>
              <DragOverlay
                dropAnimation={{
                  sideEffects: defaultDropAnimationSideEffects({}),
                }}
              >
                {activeDragColumn ? (
                  <div
                    className="perimeter-sortable-column"
                    style={{ opacity: 0.8 }}
                  >
                    <div className="perimeter-column-card">
                      <div className="perimeter-column-header">
                        <span className="perimeter-drag-handle">
                          <DragIcon />
                        </span>
                        <span className="perimeter-column-index">
                          Dálkur {columns.indexOf(activeDragColumn) + 1}
                        </span>
                      </div>
                      <div className="perimeter-column-files">
                        {lanes.map((lane) => {
                          const file = activeDragColumn.files[lane.id];
                          const appliedCol =
                            appliedColumnsMap[activeDragColumn.id];
                          const applied = appliedCol?.files?.[lane.id];
                          return (
                            <div key={lane.id} className="perimeter-file-card">
                              <div className="perimeter-file-lane-label">
                                {lane.name}
                              </div>
                              {file ? (
                                <>
                                  <PerimeterFileThumb
                                    name={applied?.name ?? file.name}
                                    source={file.source}
                                    appliedThumbnail={applied?.thumbnail}
                                  />
                                  <div
                                    className="perimeter-file-name"
                                    title={applied?.name ?? file.name}
                                  >
                                    {applied?.name ?? file.name}
                                  </div>
                                </>
                              ) : (
                                <div className="perimeter-file-empty">
                                  <span>Engin skrá</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          {lanesConfigured && columns.length > 0 && (
            <div className="perimeter-add-section">
              <Button
                appearance="ghost"
                onClick={() => {
                  setAddSelections({});
                  setShowAddDialog(true);
                }}
                disabled={busy || columns.length >= MAX_AD_COLUMNS}
              >
                <PlusIcon /> Bæta við dálki
              </Button>
              {columns.length >= MAX_AD_COLUMNS && (
                <span className="perimeter-add-limit">
                  Hámark {MAX_AD_COLUMNS} dálka náð
                </span>
              )}
            </div>
          )}

          {/* Add Column Dialog */}
          <Modal
            open={showAddDialog}
            onClose={() => {
              setShowAddDialog(false);
              setAddSelections({});
            }}
            size="sm"
            className="perimeter-add-dialog"
          >
            <Modal.Header>
              <Modal.Title>Nýr dálkur</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <p className="perimeter-add-hint">
                Veldu skrá fyrir hverja röð úr listanum eða hlaðið upp nýrri
                skrá.
              </p>
              <div className="perimeter-add-form">
                {lanes.map((lane) => (
                  <FilePicker
                    key={lane.id}
                    laneName={lane.name}
                    listenPrefix={listenPrefix}
                    selectedFile={addSelections[lane.id] ?? null}
                    onSelect={(file) =>
                      setAddSelections((prev) => ({
                        ...prev,
                        [lane.id]: file,
                      }))
                    }
                  />
                ))}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button
                appearance="primary"
                onClick={() => {
                  void handleAddColumn();
                }}
                disabled={
                  busy ||
                  columns.length >= MAX_AD_COLUMNS ||
                  !lanes.every((lane) => addSelections[lane.id] !== undefined)
                }
              >
                Vista
              </Button>
              <Button
                onClick={() => {
                  setShowAddDialog(false);
                  setAddSelections({});
                }}
              >
                Hætta við
              </Button>
            </Modal.Footer>
          </Modal>
        </div>
      )}
    </>
  );

  if (standalone) {
    return (
      <main className="perimeter-standalone perimeter-preview-modal">
        <header className="perimeter-standalone-header">
          <div>
            <h1>Jaðarskjár</h1>
            <p>Umsýsla auglýsinga og aflstýring</p>
          </div>
          <div className="perimeter-power-controls">
            {isWebVenue && (
              <Button
                appearance="ghost"
                color="blue"
                aria-label="Fara á næsta dálk"
                title="Fara á næsta dálk á öllum skjám"
                onClick={skipPerimeterCue}
                disabled={columns.length === 0 || perimeter.state !== "on"}
              >
                Næsti dálkur
              </Button>
            )}
            {isWebVenue && (
              <Button
                appearance="ghost"
                color="orange"
                aria-label="Endurræsa alla jaðarskjá"
                title="Endurræsa alla jaðarskjá (full endurhleðsla á skjánum)"
                onClick={restartPerimeterDisplays}
              >
                Endurræsa skjá
              </Button>
            )}
            <Button
              appearance={perimeter.state === "on" ? "primary" : "ghost"}
              color="green"
              onClick={() => setPerimeterState("on")}
            >
              Kveikja
            </Button>
            <Button
              appearance={perimeter.state === "off" ? "primary" : "ghost"}
              color="red"
              onClick={() => setPerimeterState("off")}
            >
              Slökkva
            </Button>
          </div>
        </header>
        {contents}
      </main>
    );
  }

  return (
    <>
      <div className="theme-trigger-row">
        <div className="theme-trigger-info">
          <span className="theme-trigger-label">Jaðarskjár</span>
          <span className="theme-trigger-preset">
            Forskoðun á klippum (endurnýjast sjálfkrafa)
          </span>
        </div>
        <Button size="sm" appearance="primary" onClick={openDialog}>
          Opna
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="full"
        className="perimeter-preview-modal"
      >
        <Modal.Header>
          <Modal.Title>Jaðarskjár — Umsýsla auglýsinga</Modal.Title>
        </Modal.Header>
        <Modal.Body>{contents}</Modal.Body>
      </Modal>
    </>
  );
};

export default PerimeterControl;
