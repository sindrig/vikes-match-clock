import { useState, useCallback } from "react";
import { Modal, Button, Toggle } from "rsuite";
import { FileUploader } from "react-drag-drop-files";
import Compress from "compress.js";
import clubIdsMap from "../club-ids";
import { storageHelpers } from "../firebase";
import {
  saveClubOverride as firebaseSaveClubOverride,
  generateClubOverrideId,
} from "../firebaseDatabase";
import { useRemoteSettings } from "../contexts/LocalStateContext";
import type { ClubOverride } from "../types";

const FILE_TYPES = ["SVG", "PNG", "JPG", "JPEG", "WEBP"];

const compress = new Compress();

const isSvg = (file: File): boolean =>
  file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");

const compressIfNeeded = async (file: File): Promise<Blob> => {
  if (isSvg(file)) return file;
  const results: File = await compress.compress(file, {
    quality: 0.8,
    maxWidth: 256,
    maxHeight: 256,
  });
  return results;
};

const bundledTeams = Object.keys(clubIdsMap).sort((a, b) =>
  a.localeCompare(b, "is"),
);

interface ClubOverrideFormProps {
  open: boolean;
  onClose: () => void;
  editOverride?: { id: string; override: ClubOverride };
}

const ClubOverrideForm = ({
  open,
  onClose,
  editOverride,
}: ClubOverrideFormProps) => {
  const { listenPrefix } = useRemoteSettings();

  const isEditMode = editOverride !== undefined;
  const isLocked = editOverride?.override.isOverride ?? false;

  const [createMode, setCreateMode] = useState<"custom" | "bundled">("custom");
  const [name, setName] = useState("");
  const [clubId, setClubId] = useState("-1");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const resetForm = useCallback(() => {
    setCreateMode("custom");
    setName("");
    setClubId("-1");
    setLogoFile(null);
    setIsLoading(false);
  }, []);

  const handleEntered = useCallback(() => {
    if (editOverride) {
      setName(editOverride.override.name);
      setClubId(editOverride.override.clubId);
      setCreateMode("custom");
    } else {
      resetForm();
    }
  }, [editOverride, resetForm]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const handleBundledSelection = useCallback((teamName: string) => {
    setName(teamName);
    const id = (clubIdsMap as Record<string, string>)[teamName] ?? "-1";
    setClubId(id);
  }, []);

  const handleFileChange = useCallback((file: File | File[]) => {
    const selected = Array.isArray(file) ? file[0] : file;
    if (selected) setLogoFile(selected);
  }, []);

  const isValid =
    name.trim() !== "" &&
    clubId.trim() !== "" &&
    (logoFile !== null || isEditMode);

  const handleSave = useCallback(async () => {
    if (!listenPrefix || !isValid) return;

    setIsLoading(true);
    try {
      if (isEditMode && editOverride) {
        const id = editOverride.id;
        let logoUrl = editOverride.override.logoUrl;

        if (logoFile) {
          const compressed = await compressIfNeeded(logoFile);
          const storagePath = `${listenPrefix}/club-logos/${id}`;
          await storageHelpers.uploadBytes(storagePath, compressed, {
            cacheControl: "public, max-age=604800",
          });
          logoUrl = await storageHelpers.getDownloadURL(storagePath);
        }

        const clubOverride: ClubOverride = {
          name,
          clubId,
          logoUrl,
          isOverride: editOverride.override.isOverride,
        };
        await firebaseSaveClubOverride(listenPrefix, id, clubOverride);
      } else {
        if (!logoFile) return;
        const compressed = await compressIfNeeded(logoFile);
        const id = generateClubOverrideId();
        const storagePath = `${listenPrefix}/club-logos/${id}`;
        await storageHelpers.uploadBytes(storagePath, compressed, {
          cacheControl: "public, max-age=604800",
        });
        const logoUrl = await storageHelpers.getDownloadURL(storagePath);

        const clubOverride: ClubOverride = {
          name,
          clubId,
          logoUrl,
          isOverride: createMode === "bundled",
        };
        await firebaseSaveClubOverride(listenPrefix, id, clubOverride);
      }

      handleClose();
    } catch (error) {
      console.error("Error saving club override:", error);
    } finally {
      setIsLoading(false);
    }
  }, [
    listenPrefix,
    isValid,
    isEditMode,
    editOverride,
    logoFile,
    name,
    clubId,
    createMode,
    handleClose,
  ]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      onEntered={handleEntered}
      size="sm"
    >
      <Modal.Header>
        <Modal.Title>{isEditMode ? "Breyta liði" : "Nýtt lið"}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {!isEditMode && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Toggle
                checked={createMode === "bundled"}
                onChange={(checked) =>
                  setCreateMode(checked ? "bundled" : "custom")
                }
              />
              <span>
                {createMode === "custom" ? "Búa til nýtt" : "Velja úr lista"}
              </span>
            </label>
          </div>
        )}

        {!isEditMode && createMode === "bundled" ? (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
              Velja lið
            </label>
            <select
              value={name}
              onChange={(e) => handleBundledSelection(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: 14,
                boxSizing: "border-box",
              }}
            >
              <option value="">Veldu lið...</option>
              {bundledTeams.map((team) => (
                <option value={team} key={team}>
                  {team}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 13 }}
              >
                Nafn
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLocked}
                placeholder="Nafn liðs..."
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 13 }}
              >
                Lið ID
              </label>
              <input
                type="text"
                value={clubId}
                onChange={(e) => setClubId(e.target.value)}
                disabled={isLocked}
                placeholder="-1"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
            </div>
          </>
        )}

        {isEditMode && editOverride?.override.logoUrl && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
              Núverandi merki
            </label>
            <img
              src={editOverride.override.logoUrl}
              alt={editOverride.override.name}
              width={64}
              height={64}
              style={{ objectFit: "contain" }}
            />
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
            {isEditMode ? "Nýtt merki" : "Merki"}
          </label>
          <FileUploader
            handleChange={handleFileChange}
            name="logo"
            types={FILE_TYPES}
          />
          {logoFile && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#888" }}>
              {logoFile.name}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button appearance="subtle" onClick={handleClose}>
            Hætta við
          </Button>
          <Button
            appearance="primary"
            disabled={!isValid || isLoading}
            loading={isLoading}
            onClick={() => void handleSave()}
          >
            Vista
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
};

export default ClubOverrideForm;
