import { useState, useEffect } from "react";
import { isInBlackoutWindow } from "../utils/blackoutUtils";

export default function useNightBlackout(
  blackoutStart: string | undefined,
  blackoutEnd: string | undefined,
  view: string,
): boolean {
  const [isBlackedOut, setIsBlackedOut] = useState(
    () =>
      isInBlackoutWindow(new Date(), blackoutStart, blackoutEnd) &&
      view === "idle",
  );

  useEffect(() => {
    const updateBlackoutState = () => {
      const inWindow = isInBlackoutWindow(
        new Date(),
        blackoutStart,
        blackoutEnd,
      );
      const isIdle = view === "idle";
      setIsBlackedOut(inWindow && isIdle);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updateBlackoutState();
      }
    };

    updateBlackoutState();

    const timer = setInterval(updateBlackoutState, 60000);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [blackoutStart, blackoutEnd, view]);

  return isBlackedOut;
}
