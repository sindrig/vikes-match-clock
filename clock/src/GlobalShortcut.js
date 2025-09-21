import PropTypes from "prop-types";
import { useEffect } from "react";

export default function GlobalShortcut({
  shortcut,
  onTrigger,
  preventDefault = false,
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      // Example: combo === "Control+k"
      const keys = shortcut.split("+");
      const ctrl = keys.includes("Control") ? e.ctrlKey : true;
      const alt = keys.includes("Alt") ? e.altKey : true;
      const shift = keys.includes("Shift") ? e.shiftKey : true;
      const key = keys.find((k) => !["Control", "Alt", "Shift"].includes(k));
      if (
        ctrl &&
        alt &&
        shift &&
        e.key.toLowerCase() === (key || "").toLowerCase()
      ) {
        if (typeof onTrigger === "function") {
          onTrigger(e);
          if (preventDefault) {
            e.preventDefault();
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcut, onTrigger]);

  // No UI – this is a logic-only component
  return null;
}

GlobalShortcut.propTypes = {
  shortcut: PropTypes.string.isRequired,
  onTrigger: PropTypes.func.isRequired,
  preventDefault: PropTypes.bool,
};
