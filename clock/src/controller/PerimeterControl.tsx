import { useState } from "react";
import { Button, Loader, Modal } from "rsuite";
import { usePerimeter } from "../contexts/FirebaseStateContext";
import "./PerimeterControl.css";

const STALE_MS = 15 * 60 * 1000;

const formatTimestamp = (updatedAt: number | null): string => {
  if (updatedAt === null) return "";
  return new Date(updatedAt).toLocaleTimeString("is-IS", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const PerimeterControl = () => {
  const { perimeter, preview, previewLoaded, getServerTime } = usePerimeter();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);

  if (!perimeter.enabled) return null;

  const openDialog = () => {
    setNow(getServerTime());
    setOpen(true);
  };

  const isStale =
    now > 0 &&
    preview !== null &&
    preview.updatedAt !== null &&
    now - preview.updatedAt > STALE_MS;

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
          <Modal.Title>Jaðarskjár forskoðun</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {preview === null ? (
            <div className="perimeter-preview-state">
              {!previewLoaded ? (
                <Loader content="Sæki forskoðun…" />
              ) : (
                <p className="perimeter-empty-text">
                  Engin forskoðun hefur verið birt enn.
                </p>
              )}
              <p className="perimeter-hint">
                Forskoðunin er sjálfkrafa sótt þegar daemoninn ræsir og eftir að
                jaðarskjárinn er kveiktur.
              </p>
            </div>
          ) : (
            <div className="perimeter-preview">
              {isStale && (
                <div className="perimeter-stale">
                  Forskoðun er gömul (uppfærð kl.{" "}
                  {formatTimestamp(preview.updatedAt)}).
                </div>
              )}
              {preview.columns.length === 0 ? (
                <p className="perimeter-empty-text">
                  Engar klippur í jaðarskjánum.
                </p>
              ) : (
                <div className="perimeter-columns">
                  {preview.columns.map((column, columnIndex) => (
                    <section
                      className="perimeter-column"
                      key={column.id ?? `column-${columnIndex}`}
                    >
                      <h4 className="perimeter-column-name">{column.name}</h4>
                      {column.clips.length === 0 ? (
                        <p className="perimeter-column-empty">Engar klippur</p>
                      ) : (
                        <div className="perimeter-clips">
                          {column.clips.map((clip, idx) => (
                            <div
                              className="perimeter-clip"
                              key={clip.id ?? `clip-${columnIndex}-${idx}`}
                            >
                              {clip.thumbnail ? (
                                <img
                                  className="perimeter-thumb"
                                  src={clip.thumbnail}
                                  alt={clip.filename}
                                />
                              ) : (
                                <div className="perimeter-thumb perimeter-thumb-unavailable">
                                  <span>Engin mynd</span>
                                </div>
                              )}
                              <div
                                className="perimeter-filename"
                                title={clip.filename}
                              >
                                {clip.filename}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}
        </Modal.Body>
      </Modal>
    </>
  );
};

export default PerimeterControl;
