import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Loader, Modal, IconButton, Badge } from "rsuite";
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
} from "../types";
import { usePerimeter } from "../contexts/FirebaseStateContext";
import { useLocalState } from "../contexts/LocalStateContext";
import { storageHelpers, ListResult } from "../firebase";
import { typedCollisionDetection } from "./asset/queue/dndUtils";
import "./PerimeterControl.css";

const STALE_MS = 15 * 60 * 1000;
const FIREBASE_BUCKET = "vikes-match-clock-firebase.appspot.com";

const formatTimestamp = (updatedAt: number | null): string => {
  if (updatedAt === null) return "";
  return new Date(updatedAt).toLocaleTimeString("is-IS", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
};

interface SortableColumnProps {
  column: PerimeterAdLayoutColumn;
  columnIndex: number;
  lanes: { id: string; name: string }[];
  appliedFiles: Record<string, PerimeterAppliedAdFile> | undefined;
  onDelete: (columnId: string) => void;
}

const SortableColumn = ({
  column,
  columnIndex,
  lanes,
  appliedFiles,
  onDelete,
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
            onClick={() => onDelete(column.id)}
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
                    {applied?.thumbnail ? (
                      <img
                        className="perimeter-file-thumb"
                        src={applied.thumbnail}
                        alt={applied.name}
                      />
                    ) : (
                      <div className="perimeter-file-thumb perimeter-thumb-unavailable">
                        <span>Engin mynd</span>
                      </div>
                    )}
                    <div
                      className="perimeter-file-name"
                      title={applied?.name ?? file.name}
                    >
                      {applied?.name ?? file.name}
                    </div>
                    {applied && (
                      <div className="perimeter-file-duration">
                        {formatDuration(applied.transportDurationMs)}
                      </div>
                    )}
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
  const [files, setFiles] = useState<{ name: string }[]>([]);
  const [listing, setListing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const storagePath = `${listenPrefix}/perimeter/`;

  const loadFiles = useCallback(async () => {
    setListing(true);
    try {
      const result: ListResult = await storageHelpers.listAll(storagePath);
      setFiles(result.items.map((item) => ({ name: item.name })));
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
    `gs://${FIREBASE_BUCKET}/${storagePath}${filename}`;

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
                onSelect({ name: f.name, source: makeGsUri(f.name) })
              }
            >
              {f.name}
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

const PerimeterControl = () => {
  const {
    perimeter,
    preview,
    getServerTime,
    setPerimeterAdLayout,
    adLayout,
    appliedAdLayout,
    appliedAdLayoutLoaded,
  } = usePerimeter();
  const { listenPrefix } = useLocalState();

  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const [localColumns, setLocalColumns] = useState<PerimeterAdLayoutColumn[]>(
    [],
  );
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addSelections, setAddSelections] = useState<
    Record<string, PerimeterAdLayoutFile>
  >({});
  const [activeDragId, setActiveDragId] = useState<UniqueIdentifier | null>(
    null,
  );
  const [writePending, setWritePending] = useState(false);

  const lanes = appliedAdLayout?.lanes ?? [];
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

  const revisionMismatch =
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

  const writeLayout = (columns: PerimeterAdLayoutColumn[]) => {
    setWritePending(true);
    const newRevision = crypto.randomUUID();
    const layout: PerimeterAdLayout = {
      version: 1,
      revision: newRevision,
      columns,
    };
    setPerimeterAdLayout(layout);
    setWritePending(false);
  };

  const openDialog = () => {
    setNow(getServerTime());
    if (adLayout?.columns) {
      setLocalColumns(adLayout.columns);
    } else if (appliedAdLayout?.columns) {
      const converted: PerimeterAdLayoutColumn[] = appliedAdLayout.columns.map(
        (col) => ({
          id: col.id,
          files: Object.fromEntries(
            Object.entries(col.files).map(([key, file]) => [
              key,
              { name: file.name, source: "" },
            ]),
          ),
        }),
      );
      setLocalColumns(converted);
    } else {
      setLocalColumns([]);
    }
    setOpen(true);
    setShowAddDialog(false);
    setAddSelections({});
  };

  const isStale =
    now > 0 &&
    preview !== null &&
    preview.updatedAt !== null &&
    now - preview.updatedAt > STALE_MS;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localColumns.findIndex((c) => c.id === active.id);
    const newIndex = localColumns.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(localColumns, oldIndex, newIndex);
    setLocalColumns(reordered);
    writeLayout(reordered);
  };

  const handleDeleteColumn = (columnId: string) => {
    if (
      !window.confirm(
        "Fjarlægja dálk? Skrárnar verða áfram í Firebase Storage.",
      )
    ) {
      return;
    }
    const remaining = localColumns.filter((c) => c.id !== columnId);
    setLocalColumns(remaining);
    writeLayout(remaining);
  };

  const handleAddColumn = () => {
    const allSelected = lanes.every(
      (lane) => addSelections[lane.id] !== undefined,
    );
    if (!allSelected) return;

    const newColumn: PerimeterAdLayoutColumn = {
      id: crypto.randomUUID(),
      files: { ...addSelections },
    };
    const updated = [...localColumns, newColumn];
    setLocalColumns(updated);
    writeLayout(updated);
    setShowAddDialog(false);
    setAddSelections({});
  };

  const activeDragColumn = activeDragId
    ? localColumns.find((c) => c.id === activeDragId)
    : null;

  const lanesConfigured = lanes.length > 0;

  if (!perimeter.enabled) return null;

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
        <Modal.Body>
          {!appliedAdLayoutLoaded ? (
            <div className="perimeter-preview-state">
              <Loader content="Sæki forskoðun..." />
              <p className="perimeter-hint">
                Forskoðunin er sjálfkrafa sótt þegar daemoninn ræsir og eftir að
                jaðarskjárinn er kveiktur.
              </p>
            </div>
          ) : appliedAdLayout === undefined ? (
            <div className="perimeter-preview-state">
              <p className="perimeter-empty-text">
                Engin forskoðun hefur verið birt enn.
              </p>
              <p className="perimeter-hint">
                Forskoðunin er sjálfkrafa sótt þegar daemoninn ræsir og eftir að
                jaðarskjárinn er kveiktur.
              </p>
            </div>
          ) : appliedAdLayout.phase === "error" ? (
            <div className="perimeter-error-state">
              <div className="perimeter-error-badge">Villa</div>
              <p className="perimeter-error-message">
                {appliedAdLayout.error ?? "Óþekkt villa"}
              </p>
            </div>
          ) : (
            <div className="perimeter-layout-board">
              {/* Status Bar */}
              <div className="perimeter-status-bar">
                <Badge
                  content={appliedAdLayout.phase}
                  className={`perimeter-phase-badge phase-${appliedAdLayout.phase}`}
                />
                {appliedAdLayout.activeColumn > 0 && (
                  <span className="perimeter-active-col">
                    Virkur dálkur: {appliedAdLayout.activeColumn}
                  </span>
                )}
                {appliedAdLayout.error && (
                  <span className="perimeter-status-error">
                    {appliedAdLayout.error}
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
                {!revisionMismatch && appliedAdLayout.revision && (
                  <span className="perimeter-revision-live">Lifandi</span>
                )}
              </div>

              {isStale && (
                <div className="perimeter-stale">
                  Forskoðun er gömul (uppfærð kl.{" "}
                  {formatTimestamp(preview?.updatedAt ?? null)}).
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
              ) : localColumns.length === 0 ? (
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
                  >
                    Bæta við dálki
                  </Button>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={typedCollisionDetection}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <div className="perimeter-columns-scroll">
                    <SortableContext
                      items={localColumns.map((c) => c.id)}
                      strategy={horizontalListSortingStrategy}
                    >
                      {localColumns.map((column, idx) => {
                        const appliedCol = appliedColumnsMap[column.id];
                        return (
                          <SortableColumn
                            key={column.id}
                            column={column}
                            columnIndex={idx}
                            lanes={lanes}
                            appliedFiles={appliedCol?.files}
                            onDelete={handleDeleteColumn}
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
                              Dálkur{" "}
                              {localColumns.indexOf(activeDragColumn) + 1}
                            </span>
                          </div>
                          <div className="perimeter-column-files">
                            {lanes.map((lane) => {
                              const file = activeDragColumn.files[lane.id];
                              const appliedCol =
                                appliedColumnsMap[activeDragColumn.id];
                              const applied = appliedCol?.files?.[lane.id];
                              return (
                                <div
                                  key={lane.id}
                                  className="perimeter-file-card"
                                >
                                  <div className="perimeter-file-lane-label">
                                    {lane.name}
                                  </div>
                                  {file ? (
                                    <>
                                      {applied?.thumbnail ? (
                                        <img
                                          className="perimeter-file-thumb"
                                          src={applied.thumbnail}
                                          alt={applied.name}
                                        />
                                      ) : (
                                        <div className="perimeter-file-thumb perimeter-thumb-unavailable">
                                          <span>Engin mynd</span>
                                        </div>
                                      )}
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

              {lanesConfigured && localColumns.length > 0 && (
                <div className="perimeter-add-section">
                  <Button
                    appearance="ghost"
                    onClick={() => {
                      setAddSelections({});
                      setShowAddDialog(true);
                    }}
                    disabled={writePending}
                  >
                    <PlusIcon /> Bæta við dálki
                  </Button>
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
                    onClick={handleAddColumn}
                    disabled={
                      writePending ||
                      !lanes.every(
                        (lane) => addSelections[lane.id] !== undefined,
                      )
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
        </Modal.Body>
      </Modal>
    </>
  );
};

export default PerimeterControl;
