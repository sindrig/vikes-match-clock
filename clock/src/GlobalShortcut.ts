import { useEffect } from "react";

interface GlobalShortcutProps {
  shortcut: string;
  onTrigger: (e: KeyboardEvent) => void;
  preventDefault?: boolean;
}

export default function GlobalShortcut({
  shortcut,
  onTrigger,
  preventDefault = false,
}: GlobalShortcutProps): null {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
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
  }, [shortcut, onTrigger, preventDefault]);

  // No UI – this is a logic-only component
  return null;
}
