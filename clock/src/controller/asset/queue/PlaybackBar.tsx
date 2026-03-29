import { MdSkipNext, MdStop } from "react-icons/md";
import { useController } from "../../../contexts/FirebaseStateContext";
import "./PlaybackBar.css";

const PlaybackBar = () => {
  const { controller, showNextAsset, updateController } = useController();

  const { activeQueueId, queues, currentAsset } = controller;
  const activeQueue = activeQueueId ? queues[activeQueueId] : null;

  if (!activeQueue && !currentAsset) return null;

  const remaining = activeQueue ? activeQueue.items.length : 0;
  const hasNext = !!activeQueue;

  const handleNext = () => {
    showNextAsset();
  };

  const handleStop = () => {
    updateController({
      playing: false,
      currentAsset: null,
      activeQueueId: null,
    });
  };

  const queueName = activeQueue ? activeQueue.name : "";

  return (
    <div className="playback-bar" data-testid="playback-bar">
      <div className="playback-bar-info">
        <span className="playback-bar-name">{queueName}</span>
        <span className="playback-bar-remaining">{remaining} eftir</span>
      </div>
      <div className="playback-bar-controls">
        <button
          type="button"
          className="playback-bar-btn playback-bar-btn--next"
          onClick={handleNext}
          disabled={!hasNext}
          aria-label="Next in queue"
          title="Next"
        >
          <MdSkipNext />
        </button>
        <button
          type="button"
          className="playback-bar-btn playback-bar-btn--stop"
          onClick={handleStop}
          aria-label="Stop playback"
          title="Stop"
        >
          <MdStop />
        </button>
      </div>
    </div>
  );
};

export default PlaybackBar;
