import { useEffect } from "react";
import { useMatch, useController } from "../contexts/FirebaseStateContext";
import { useLocalState } from "../contexts/LocalStateContext";
import { VIEWS, ASSET_VIEWS } from "../constants";

export default function useGlobalShortcuts() {
  const { auth } = useLocalState();
  const {
    match: { started },
    startMatch,
    pauseMatch,
    addGoal,
  } = useMatch();

  const {
    controller: { view, assetView, activeQueueId, queues, currentAsset },
    showNextAsset,
    renderAsset,
  } = useController();

  // Extract primitives to stabilize dependency array
  const activeQueue = activeQueueId ? queues[activeQueueId] : null;
  const hasQueueItems = (activeQueue?.items.length ?? 0) > 0;
  const hasCurrentAsset = !!currentAsset;
  const isLoggedIn = !auth.isEmpty;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Check if controls should be active
      if (!isLoggedIn) {
        return;
      }

      // Match Control Shortcuts (only when in Control view)
      if (view === VIEWS.control) {
        switch (event.code) {
          case "Space":
            event.preventDefault();
            if (started) {
              pauseMatch();
            } else {
              startMatch();
            }
            break;
          case "ArrowUp":
            event.preventDefault();
            addGoal("home");
            break;
          case "ArrowDown":
            event.preventDefault();
            addGoal("away");
            break;
        }
      }

      // Asset Control Shortcuts (only when in Match/Idle view and Assets tab)
      if (
        (view === VIEWS.match || view === VIEWS.idle) &&
        assetView === ASSET_VIEWS.assets
      ) {
        if (event.code === "Space") {
          event.preventDefault();
          if (hasQueueItems) {
            showNextAsset();
          } else if (hasCurrentAsset) {
            renderAsset(null);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    view,
    assetView,
    hasQueueItems,
    hasCurrentAsset,
    started,
    startMatch,
    pauseMatch,
    addGoal,
    showNextAsset,
    renderAsset,
    isLoggedIn,
  ]);
}
