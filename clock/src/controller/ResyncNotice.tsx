import {
  useFirebaseReadStatus,
  useMutationStatus,
} from "../contexts/FirebaseStateContext";

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
  const { writeEligible, writeFreshness, mutationError, dismissMutationError } =
    useMutationStatus();

  const { retry } = useFirebaseReadStatus();

  if (writeEligible && !mutationError) {
    return null;
  }

  const label = FRESHNESS_LABELS[writeFreshness] ?? "Skrif læst";

  return (
    <div className="resync-notice" role="status" aria-live="polite">
      <span className="resync-notice-icon" aria-hidden="true">
        ⚠
      </span>
      <span>{mutationError ?? label}</span>
      {!writeEligible && (
        <button type="button" onClick={retry}>
          Reyna lestur aftur
        </button>
      )}
      {mutationError && (
        <button type="button" onClick={dismissMutationError}>
          Loka
        </button>
      )}
    </div>
  );
};

export default ResyncNotice;
