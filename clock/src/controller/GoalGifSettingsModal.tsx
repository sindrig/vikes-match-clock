import React, { useRef } from "react";
import { Modal, Button, Toggle } from "rsuite";
import { storageHelpers } from "../firebase";
import { useView } from "../contexts/FirebaseStateContext";
import { useRemoteSettings } from "../contexts/LocalStateContext";
import { isVideoUrl } from "../utils/matchUtils";

const buildGoalMediaPath = (
  listenPrefix: string,
  slot: "goalGif1" | "goalGif2",
  fileName: string,
): string => {
  const ext = fileName.split(".").pop() || "gif";
  return `${listenPrefix}/goal-media/${slot}-${Date.now()}.${ext}`;
};

interface GoalGifSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const GoalGifSettingsModal: React.FC<GoalGifSettingsModalProps> = ({
  open,
  onClose,
}) => {
  const { view, setGoalGifSettings } = useView();
  const { listenPrefix } = useRemoteSettings();
  const gif1Ref = useRef<HTMLInputElement>(null);
  const gif2Ref = useRef<HTMLInputElement>(null);

  const uploadMedia = async (file: File, slot: "goalGif1" | "goalGif2") => {
    const path = buildGoalMediaPath(listenPrefix, slot, file.name);
    await storageHelpers.uploadBytes(path, file, {
      cacheControl: "public, max-age=31536000",
      contentType: file.type,
    });
    const url = await storageHelpers.getDownloadURL(path);
    setGoalGifSettings({ [slot]: url });
  };

  const handleFileChange =
    (slot: "goalGif1" | "goalGif2") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        void uploadMedia(file, slot);
      }
      e.target.value = "";
    };

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <Modal.Header>
        <Modal.Title>Heimalið mark stillingar</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label
              style={{
                fontWeight: "bold",
                display: "block",
                marginBottom: 4,
              }}
            >
              Mark bakgrunn 1
            </label>
            <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 8px" }}>
              Birtist þegar ýtt er á mark en markaskorari ekki valinn
            </p>
            {view.goalGif1 &&
              (isVideoUrl(view.goalGif1) ? (
                <video
                  src={view.goalGif1}
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={{
                    maxWidth: 200,
                    maxHeight: 120,
                    display: "block",
                    marginBottom: 8,
                    borderRadius: 4,
                  }}
                />
              ) : (
                <img
                  src={view.goalGif1}
                  alt="Mark 1"
                  style={{
                    maxWidth: 200,
                    maxHeight: 120,
                    display: "block",
                    marginBottom: 8,
                    borderRadius: 4,
                  }}
                />
              ))}
            <input
              ref={gif1Ref}
              type="file"
              accept="image/gif,image/*,video/mp4,video/webm"
              style={{ display: "none" }}
              onChange={handleFileChange("goalGif1")}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                size="sm"
                appearance="primary"
                onClick={() => gif1Ref.current?.click()}
              >
                Hlaða upp
              </Button>
              {view.goalGif1 && (
                <Button
                  size="sm"
                  appearance="ghost"
                  onClick={() => setGoalGifSettings({ goalGif1: null })}
                >
                  Fjarlægja
                </Button>
              )}
            </div>
            <p style={{ fontSize: 11, opacity: 0.5, margin: "4px 0 0" }}>
              GIF, PNG, JPG, MP4, WebM
            </p>
          </div>

          <div style={{ borderTop: "1px solid #3c3f43", paddingTop: 16 }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <Toggle
                checked={view.showGoalscorerName ?? true}
                onChange={(checked) =>
                  setGoalGifSettings({ showGoalscorerName: checked })
                }
              />
              <span>Sýna nafn markaskorara</span>
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <Toggle
                checked={view.showGoalscorerNumber ?? true}
                onChange={(checked) =>
                  setGoalGifSettings({ showGoalscorerNumber: checked })
                }
              />
              <span>Sýna númer markaskorara</span>
            </label>
          </div>

          <div style={{ borderTop: "1px solid #3c3f43", paddingTop: 16 }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <Toggle
                checked={view.goalGifSameImage ?? false}
                onChange={(checked) =>
                  setGoalGifSettings({ goalGifSameImage: checked })
                }
              />
              <span>Nota sömu mynd</span>
            </label>
          </div>

          {!view.goalGifSameImage && (
            <div>
              <label
                style={{
                  fontWeight: "bold",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Mark bakgrunn 2
              </label>
              <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 8px" }}>
                Birtist þegar markaskorari er valinn
              </p>
              {view.goalGif2 &&
                (isVideoUrl(view.goalGif2) ? (
                  <video
                    src={view.goalGif2}
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{
                      maxWidth: 200,
                      maxHeight: 120,
                      display: "block",
                      marginBottom: 8,
                      borderRadius: 4,
                    }}
                  />
                ) : (
                  <img
                    src={view.goalGif2}
                    alt="Mark 2"
                    style={{
                      maxWidth: 200,
                      maxHeight: 120,
                      display: "block",
                      marginBottom: 8,
                      borderRadius: 4,
                    }}
                  />
                ))}
              <input
                ref={gif2Ref}
                type="file"
                accept="image/gif,image/*,video/mp4,video/webm"
                style={{ display: "none" }}
                onChange={handleFileChange("goalGif2")}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  size="sm"
                  appearance="primary"
                  onClick={() => gif2Ref.current?.click()}
                >
                  Hlaða upp
                </Button>
                {view.goalGif2 && (
                  <Button
                    size="sm"
                    appearance="ghost"
                    onClick={() => setGoalGifSettings({ goalGif2: null })}
                  >
                    Fjarlægja
                  </Button>
                )}
              </div>
              <p style={{ fontSize: 11, opacity: 0.5, margin: "4px 0 0" }}>
                GIF, PNG, JPG, MP4, WebM
              </p>
            </div>
          )}
        </div>
      </Modal.Body>
    </Modal>
  );
};

export default GoalGifSettingsModal;
