import type { ReadStatus } from "../contexts/subscriptionRead";

export default function ReadNotice({
  status,
  retry,
}: {
  status: ReadStatus;
  retry: () => void;
}) {
  if (status.phase !== "error") return null;
  return (
    <div role="alert" className="resync-notice">
      <span>{status.message}</span>
      <button type="button" onClick={retry}>
        Reyna lestur aftur
      </button>
    </div>
  );
}
