import React, { useRef } from "react";
import { Modal, Button, Toggle, InputNumber } from "rsuite";
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

          <div style={{ borderTop: "1px solid #3c3f43", paddingTop: 16 }}>
            <label
              style={{
                fontWeight: "bold",
                display: "block",
                marginBottom: 8,
              }}
            >
              Flicker reveal stillingar
            </label>
            <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 12px" }}>
              Stýrir blikkandi áhrifum þegar markaskorari birtist
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <label style={{ fontSize: 13 }}>
                <span style={{ display: "block", marginBottom: 2 }}>
                  Upphafstími ON (sek)
                </span>
                <InputNumber
                  size="sm"
                  step={0.01}
                  min={0.01}
                  max={2}
                  value={view.flickerInitialOn ?? 0.03}
                  onChange={(val) =>
                    setGoalGifSettings({
                      flickerInitialOn: Number(val) || 0.03,
                    })
                  }
                />
              </label>
              <label style={{ fontSize: 13 }}>
                <span style={{ display: "block", marginBottom: 2 }}>
                  Upphafstími OFF (sek)
                </span>
                <InputNumber
                  size="sm"
                  step={0.01}
                  min={0.01}
                  max={2}
                  value={view.flickerInitialOff ?? 0.4}
                  onChange={(val) =>
                    setGoalGifSettings({
                      flickerInitialOff: Number(val) || 0.4,
                    })
                  }
                />
              </label>
              <label style={{ fontSize: 13 }}>
                <span style={{ display: "block", marginBottom: 2 }}>
                  ON vöxtur (margfaldari)
                </span>
                <InputNumber
                  size="sm"
                  step={0.05}
                  min={1}
                  max={3}
                  value={view.flickerOnGrowth ?? 1.2}
                  onChange={(val) =>
                    setGoalGifSettings({ flickerOnGrowth: Number(val) || 1.2 })
                  }
                />
              </label>
              <label style={{ fontSize: 13 }}>
                <span style={{ display: "block", marginBottom: 2 }}>
                  OFF minnkun (margfaldari)
                </span>
                <InputNumber
                  size="sm"
                  step={0.05}
                  min={0.1}
                  max={1}
                  value={view.flickerOffDecay ?? 0.82}
                  onChange={(val) =>
                    setGoalGifSettings({ flickerOffDecay: Number(val) || 0.82 })
                  }
                />
              </label>
              <label style={{ fontSize: 13 }}>
                <span style={{ display: "block", marginBottom: 2 }}>
                  Fjöldi hringja
                </span>
                <InputNumber
                  size="sm"
                  step={1}
                  min={3}
                  max={30}
                  value={view.flickerCycles ?? 16}
                  onChange={(val) =>
                    setGoalGifSettings({ flickerCycles: Number(val) || 16 })
                  }
                />
              </label>
              <label style={{ fontSize: 13 }}>
                <span style={{ display: "block", marginBottom: 2 }}>
                  Jitter (handahóf ±%)
                </span>
                <InputNumber
                  size="sm"
                  step={0.05}
                  min={0}
                  max={0.8}
                  value={view.flickerJitter ?? 0.3}
                  onChange={(val) =>
                    setGoalGifSettings({ flickerJitter: Number(val) || 0 })
                  }
                />
              </label>
            </div>
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
};

export default GoalGifSettingsModal;
