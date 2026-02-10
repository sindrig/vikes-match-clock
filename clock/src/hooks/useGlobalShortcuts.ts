import { useEffect } from "react";
import { useMatch, useController } from "../contexts/FirebaseStateContext";
import { VIEWS, ASSET_VIEWS } from "../reducers/controller";

export default function useGlobalShortcuts() {
  const {
    match: { started },
    startMatch,
    pauseMatch,
    addGoal,
  } = useMatch();

  const {
    controller: { view, assetView, selectedAssets, currentAsset },
    showNextAsset,
    renderAsset,
  } = useController();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
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
          if (selectedAssets.length > 0) {
            showNextAsset();
          } else if (currentAsset) {
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
    selectedAssets,
    currentAsset,
    started,
    startMatch,
    pauseMatch,
    addGoal,
    showNextAsset,
    renderAsset,
  ]);
}
