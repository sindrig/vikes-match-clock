import { Modal, Loader } from "rsuite";
import { useAuditHistory, RECENT_EVENT_LIMIT } from "./useAuditHistory";
import { useLocalState } from "../../contexts/LocalStateContext";
import type { AuditEvent } from "../../types";
import "./AuditHistory.css";

const ACTION_LABELS: Record<string, string> = {
  "match.start": "Ræst",
  "match.pause": "Pása",
  "match.reset": "Endurstillt",
  "match.add-goal": "Mark",
  "match.add-penalty": "Bætt við tvímenna",
  "match.remove-penalty": "Fjarlægð tvímenna",
  "match.add-to-penalty": "Lengd tvímenna breytt",
  "match.update-half-length": "Hálfleikslengd breytt",
  "match.set-half-stops": "Hálfleiksmörk breytt",
  "match.timeout": "Leikhlé",
  "match.remove-timeout": "Leikhlé fjarlægt",
  "match.buzz": "Flauta",
  "match.countdown": "Niðurtalning hefur hafist",
  "match.start-halftime-countdown": "Niðurtalning hálfleiks",
  "match.stop-halftime-countdown": "Niðurtalning stoppuð",
  "match.update-red-cards": "Rauð spjöld breytt",
  "match.update": "Leikuppfærsla",
  "controller.select-view": "Skjámynd valin",
  "controller.select-asset-view": "Efnissýn valin",
  "controller.create-queue": "Biðröð búin til",
  "controller.delete-queue": "Biðröð fjarlægð",
  "controller.rename-queue": "Biðröð endurnefnd",
  "controller.reorder-queues": "Biðraðir raðaðar",
  "controller.add-items-to-queue": "Efni bætt í biðröð",
  "controller.remove-item-from-queue": "Efni fjarlægt úr biðröð",
  "controller.reorder-items-in-queue": "Efni raðað í biðröð",
  "controller.play-queue": "Biðröð spiluð",
  "controller.activate-queue": "Biðröð virkjuð",
  "controller.stop-playing": "Spilun stopp",
  "controller.set-playing": "Spilun breytt",
  "controller.render-asset": "Efni birt",
  "controller.show-next-asset": "Næsta efni birt",
  "controller.remove-asset-after-timeout": "Efni fjarlægt eftir tíma",
  "controller.remote-refresh": "Fjarkæring",
  "controller.set-roster": "Leikmannahópur settur",
  "controller.edit-player": "Leikmaður breyttur",
  "controller.delete-player": "Leikmaður fjarlægður",
  "controller.add-player": "Leikmaður bættur",
  "controller.clear-roster": "Leikmannahópur hreinsaður",
  "controller.select-tab": "Flipavali breytt",
  "controller.update": "Stjórnborð uppfært",
  "view.update": "Sýn uppfærð",
  "view.set-viewport": "Skjástærð breytt",
  "view.set-background": "Bakgrunnur breyttur",
  "view.set-idle-image": "Aðgerðalaus mynd breytt",
  "view.set-idle-ad": "Aðgerðalaus auglýsing breytt",
  "view.set-blackout-start": "Næturbyrjun breytt",
  "view.set-blackout-end": "Næturlok breytt",
  "view.set-goal-gif-settings": "Markahnippugerðir breytt",
  "view.set-theme": "Þema breytt",
  "view.set-theme-preset": "Þemaforstilling breytt",
  "view.save-custom-preset": "Þemaforstilling vistuð",
  "view.delete-custom-preset": "Þemaforstilling fjarlægð",
  "perimeter.set-state": "Jaðarskjár kveiktur/slökkt",
  "perimeter.set-overlay": "Jaðaroverlay sett",
  "perimeter.clear-overlay": "Jaðaroverlay hreinsað",
  "perimeter.set-ad-layout": "Jaðarútlit sett",
  "perimeter.create-media-pair": "Jaðarefni búið til",
  "perimeter.delete-media-pair": "Jaðarefni fjarlægt",
  "clubOverrides.save": "Liðoverride vistað",
  "clubOverrides.update": "Liðoverride uppfært",
  "clubOverrides.create": "Liðoverride búið til",
  "clubOverrides.delete": "Liðoverride fjarlægt",
};

const actionLabel = (action: string): string => ACTION_LABELS[action] ?? action;

const formatTimestamp = (timestamp: number): string =>
  new Date(timestamp).toLocaleString("is-IS");

const formatSessionId = (sessionId: string): string =>
  sessionId.length > 8 ? `${sessionId.slice(0, 8)}…` : sessionId;

const formatChangedPaths = (changes: Record<string, unknown>): string =>
  Object.keys(changes).join(", ");

const AuditEventRow = ({ event }: { event: AuditEvent }) => (
  <div className="audit-event">
    <div className="audit-event-head">
      <span className="audit-event-time">
        {formatTimestamp(event.timestamp)}
      </span>
      <span className="audit-event-action">{actionLabel(event.action)}</span>
    </div>
    <div className="audit-event-meta">
      <span className="audit-event-meta-item">
        Notandi: <code>{event.uid}</code>
      </span>
      <span className="audit-event-meta-item">
        Vefsetur: <code>{formatSessionId(event.sessionId)}</code>
      </span>
      <span className="audit-event-meta-item">Svið: {event.stateArea}</span>
    </div>
    <div className="audit-event-changes">
      Breytt: {formatChangedPaths(event.changes)}
    </div>
  </div>
);

interface AuditHistoryModalProps {
  open: boolean;
  onClose: () => void;
}

const AuditHistoryModal = ({ open, onClose }: AuditHistoryModalProps) => {
  const { listenPrefix } = useLocalState();
  const { events, loading, error } = useAuditHistory(listenPrefix, open);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      className="audit-history-modal"
    >
      <Modal.Header>
        <Modal.Title>Breytingasaga</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <div className="audit-loading">
            <Loader center content="Hleð breytingasögu..." />
          </div>
        ) : null}
        {!loading && error ? (
          <div className="audit-error" role="alert">
            {error}
          </div>
        ) : null}
        {!loading && !error && events.length === 0 ? (
          <div className="audit-empty">
            Engin breytingasaga er tiltæk á þessum stað.
          </div>
        ) : null}
        {!loading && !error && events.length > 0 ? (
          <>
            <div className="audit-count">
              Síðustu {Math.min(events.length, RECENT_EVENT_LIMIT)} atvik,
              nýjust fyrst.
            </div>
            <div className="audit-list">
              {events.map((event) => (
                <AuditEventRow
                  key={event.id ?? `${event.timestamp}-${event.uid}`}
                  event={event}
                />
              ))}
            </div>
          </>
        ) : null}
      </Modal.Body>
    </Modal>
  );
};

export default AuditHistoryModal;
