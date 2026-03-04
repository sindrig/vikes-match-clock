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

    // Check immediately when dependencies change (auto-resume on view switch)
    updateBlackoutState();

    const timer = setInterval(updateBlackoutState, 60000);

    return () => clearInterval(timer);
  }, [blackoutStart, blackoutEnd, view]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const inWindow = isInBlackoutWindow(
          new Date(),
          blackoutStart,
          blackoutEnd,
        );
        const isIdle = view === "idle";
        setIsBlackedOut(inWindow && isIdle);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [blackoutStart, blackoutEnd, view]);

  return isBlackedOut;
}
