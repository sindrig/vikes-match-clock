import { useFirebaseState } from "../contexts/FirebaseStateContext";

// Concise operator feedback when the client is not write-eligible (initial
// load, hidden/offline, or resynchronizing after a resume/reconnect). Shared
// mutations are already blocked by the freshness barrier; this surfaces why.
const FRESHNESS_LABELS: Record<string, string> = {
  loading: "Hleð stöðu…",
  hidden: "Skjár falinn — skrif læst",
  offline: "Engin tenging — skrif læst",
  resyncing: "Samstilli við Firebase…",
};

const ResyncNotice = () => {
  const { writeEligible, writeFreshness } = useFirebaseState();

  if (writeEligible) {
    return null;
  }

  const label = FRESHNESS_LABELS[writeFreshness] ?? "Skrif læst";

  return (
    <div className="resync-notice" role="status" aria-live="polite">
      <span className="resync-notice-icon">⚠</span>
      <span>{label}</span>
    </div>
  );
};

export default ResyncNotice;
