import React, { useCallback, useState } from "react";
import { Button, Loader, Modal, Badge } from "rsuite";
import PlusIcon from "@rsuite/icons/Plus";
import { usePerimeter } from "../../contexts/FirebaseStateContext";
import { useLocalState } from "../../contexts/LocalStateContext";
import {
  PerimeterMediaPair,
  PerimeterOverlayFile,
  PerimeterOverlayPhase,
} from "../../types";
import { storageHelpers, FIREBASE_STORAGE_BUCKET } from "../../firebase";

import "./PerimeterMediaPairs.css";

const TARGETS = [
  { key: "2", folder: "48", label: "48 skjáir" },
  { key: "4", folder: "40", label: "40 skjáir" },
] as const;

const MAX_NAME_LENGTH = 80;
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
const OVERLAY_DURATION_MS = 10000;

const PHASE_LABELS: Record<PerimeterOverlayPhase, string> = {
  downloading: "Sækir",
  copying: "Afritar",
  loading: "Hleður",
  playing: "Spilar",
  error: "Villa",
};

const slugify = (value: string): string => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "media";
};

const safeExtension = (filename: string): string => {
  const idx = filename.lastIndexOf(".");
  if (idx < 0) return "";
  const ext = filename.slice(idx);
  return /^\.[A-Za-z0-9]{1,8}$/.test(ext) ? ext : "";
};

const validateFile = (file: File): string | null => {
  if (file.size === 0) return "Skrá er tóm.";
  if (file.size > MAX_UPLOAD_BYTES) return "Skrá er of stór (max 250 MB).";
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return "Aðeins myndir og myndskeið leyfð.";
  }
  return null;
};

const PerimeterMediaPairs: React.FC = () => {
  const {
    mediaPairs,
    createPerimeterMediaPair,
    deletePerimeterMediaPair,
    setPerimeterOverlay,
    clearPerimeterOverlay,
    overlayStatus,
  } = usePerimeter();
  const { auth, listenPrefix } = useLocalState();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [file48, setFile48] = useState<File | null>(null);
  const [file40, setFile40] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canMutate = !auth.isEmpty && listenPrefix !== "";
  const pairs = Object.entries(mediaPairs);

  const openCreate = () => {
    setError(null);
    setName("");
    setFile48(null);
    setFile40(null);
    setShowCreate(true);
  };

  const closeCreate = () => {
    if (uploading) return;
    setShowCreate(false);
  };

  const handleCreate = async () => {
    if (!canMutate || uploading) return;
    const trimmedName = name.trim();
    if (!trimmedName || !file48 || !file40) return;

    const validationError = validateFile(file48) ?? validateFile(file40);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setError(null);

    const pairId = crypto.randomUUID();
    const stamp = Date.now();
    const files: Record<string, PerimeterOverlayFile> = {};
    const uploadedPaths: string[] = [];

    try {
      const uploadPromises = TARGETS.map((target) => {
        const file = target.key === "2" ? file48 : file40;
        const ext = safeExtension(file.name);
        const generatedName = `${target.folder}-${stamp}-${slugify(trimmedName)}${ext}`;
        const storagePath = `${listenPrefix}/perimeter-overlays/${pairId}/${target.folder}/${generatedName}`;
        files[target.key] = {
          name: generatedName,
          source: `gs://${FIREBASE_STORAGE_BUCKET}/${storagePath}`,
        };
        return storageHelpers
          .uploadBytes(storagePath, file, {
            cacheControl: "public, max-age=604800",
          })
          .then(() => {
            // Track every upload that actually landed so a later failure can
            // clean it up instead of orphaning multi-hundred-MB files.
            uploadedPaths.push(storagePath);
          });
      });

      // Wait for both uploads to settle before writing the library record so
      // a failed upload never leaves a half-uploaded pair in the library and
      // the set of successful uploads is known before cleanup runs.
      const uploadResults = await Promise.allSettled(uploadPromises);
      const failedUpload = uploadResults.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failedUpload) {
        throw failedUpload.reason;
      }
      await createPerimeterMediaPair(pairId, {
        name: trimmedName,
        files,
      });

      setShowCreate(false);
      setName("");
      setFile48(null);
      setFile40(null);
    } catch (err) {
      // Best-effort delete of the uploads that already landed in Storage so a
      // failed create never leaves unreachable files behind (a retry uploads
      // again under a fresh pair ID).
      await Promise.allSettled(
        uploadedPaths.map((path) => storageHelpers.deleteObject(path)),
      );
      setError(
        err instanceof Error
          ? err.message
          : "Ekki tókst að vista jaðarefni. Reyndu aftur.",
      );
    } finally {
      setUploading(false);
    }
  };

  const showPair = (pair: PerimeterMediaPair) => {
    if (!canMutate) return;
    setPerimeterOverlay({
      version: 1,
      id: crypto.randomUUID(),
      columns: [
        {
          durationMs: OVERLAY_DURATION_MS,
          files: pair.files,
        },
      ],
    });
  };

  const clearOverlay = () => {
    if (!canMutate) return;
    clearPerimeterOverlay();
  };

  const handleDelete = useCallback(
    (pairId: string) => {
      if (
        !canMutate ||
        !window.confirm(
          "Fjarlægja jaðarefni? Skrárnar verða áfram í Firebase Storage.",
        )
      ) {
        return;
      }
      setDeletingId(pairId);
      deletePerimeterMediaPair(pairId)
        .catch(() => {
          setError("Ekki tókst að eyða jaðarefni.");
        })
        .finally(() => setDeletingId(null));
    },
    [canMutate, deletePerimeterMediaPair],
  );

  const createDisabled =
    !canMutate ||
    uploading ||
    name.trim().length === 0 ||
    name.trim().length > MAX_NAME_LENGTH ||
    !file48 ||
    !file40;

  return (
    <div className="media-pairs">
      <div className="media-pairs-toolbar">
        <Button
          size="sm"
          appearance="primary"
          onClick={openCreate}
          disabled={!canMutate}
        >
          <PlusIcon /> Nýtt jaðarefni
        </Button>
        <Button
          size="sm"
          appearance="ghost"
          color="red"
          onClick={clearOverlay}
          disabled={!canMutate}
        >
          Hreinsa jaðarskjá
        </Button>
      </div>

      {overlayStatus && (
        <div className="media-pairs-status">
          <Badge
            content={PHASE_LABELS[overlayStatus.phase]}
            className={`media-pairs-phase phase-${overlayStatus.phase}`}
          />
          {overlayStatus.error && (
            <span className="media-pairs-status-error">
              {overlayStatus.error}
            </span>
          )}
        </div>
      )}

      {error && <div className="media-pairs-error">{error}</div>}

      {pairs.length === 0 ? (
        <div className="media-pairs-empty">Engin jaðarefni skráð.</div>
      ) : (
        <div className="media-pairs-grid">
          {pairs.map(([pairId, pair]) => (
            <div className="media-pair-card withborder" key={pairId}>
              <div className="media-pair-name">{pair.name}</div>
              <div className="media-pair-file">
                48 skjáir: {pair.files["2"]?.name ?? "—"}
              </div>
              <div className="media-pair-file">
                40 skjáir: {pair.files["4"]?.name ?? "—"}
              </div>
              <div className="media-pair-actions">
                <Button
                  size="sm"
                  appearance="primary"
                  color="green"
                  onClick={() => showPair(pair)}
                  disabled={!canMutate}
                >
                  Sýna
                </Button>
                <Button
                  size="sm"
                  appearance="ghost"
                  color="red"
                  onClick={() => handleDelete(pairId)}
                  disabled={!canMutate || deletingId === pairId}
                >
                  {deletingId === pairId ? <Loader size="xs" /> : "Fjarlægja"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={closeCreate} size="sm">
        <Modal.Header>
          <Modal.Title>Nýtt jaðarefni</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="media-pair-form">
            <div className="media-pair-field">
              <label className="media-pair-label" htmlFor="media-pair-name">
                Nafn
              </label>
              <input
                id="media-pair-name"
                className="media-pair-input"
                value={name}
                maxLength={MAX_NAME_LENGTH}
                onChange={(e) => setName(e.target.value)}
                placeholder="t.d. Sindri"
              />
            </div>
            {TARGETS.map((target) => {
              const file = target.key === "2" ? file48 : file40;
              const labelId = `media-pair-target-${target.key}-label`;
              const onPick = (picked: File | null) =>
                target.key === "2" ? setFile48(picked) : setFile40(picked);
              return (
                <div className="media-pair-field" key={target.key}>
                  <label className="media-pair-label" id={labelId}>
                    {target.label}
                  </label>
                  <label className="media-pair-picker">
                    {file ? file.name : "Velja skrá"}
                    <input
                      type="file"
                      aria-labelledby={labelId}
                      accept="image/*,video/*"
                      disabled={uploading}
                      onChange={(e) => {
                        const picked = e.target.files?.[0] ?? null;
                        onPick(picked);
                      }}
                    />
                  </label>
                </div>
              );
            })}
            {uploading && (
              <div className="media-pair-uploading">
                <Loader size="sm" content="Hleður upp..." />
              </div>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            appearance="primary"
            onClick={() => {
              void handleCreate();
            }}
            disabled={createDisabled}
          >
            Vista
          </Button>
          <Button onClick={closeCreate} disabled={uploading}>
            Hætta við
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default PerimeterMediaPairs;
