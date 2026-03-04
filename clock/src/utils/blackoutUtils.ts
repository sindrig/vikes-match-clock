/**
 * Checks if a given time falls within a blackout window.
 * Handles both midnight-wrapping windows (e.g., 20:00-08:00) and normal windows (e.g., 09:00-17:00).
 *
 * @param now - The current time to check
 * @param start - Start time in "HH:MM" format (undefined or empty = feature disabled)
 * @param end - End time in "HH:MM" format (undefined or empty = feature disabled)
 * @returns true if now is within the blackout window, false otherwise
 *
 * Boundary behavior:
 * - Start time is INCLUSIVE
 * - End time is EXCLUSIVE
 * - Seconds and milliseconds are ignored
 */
export function isInBlackoutWindow(
  now: Date,
  start: string | undefined,
  end: string | undefined,
): boolean {
  // Feature disabled if start or end is missing or empty
  if (!start || !end) {
    return false;
  }

  // Parse time strings
  const startParts = start.split(":");
  const endParts = end.split(":");
  const startHour = Number(startParts[0]);
  const startMin = Number(startParts[1]);
  const endHour = Number(endParts[0]);
  const endMin = Number(endParts[1]);

  // Get current time components (ignoring seconds/milliseconds)
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();

  // Convert times to minutes for easy comparison
  const currentTimeInMinutes = currentHour * 60 + currentMin;
  const startTimeInMinutes = startHour * 60 + startMin;
  const endTimeInMinutes = endHour * 60 + endMin;

  // If start and end are the same, window is empty
  if (startTimeInMinutes === endTimeInMinutes) {
    return false;
  }

  // Midnight-wrapping window (e.g., 20:00-08:00)
  if (startTimeInMinutes > endTimeInMinutes) {
    return (
      currentTimeInMinutes >= startTimeInMinutes ||
      currentTimeInMinutes < endTimeInMinutes
    );
  }

  // Normal non-wrapping window (e.g., 09:00-17:00)
  return (
    currentTimeInMinutes >= startTimeInMinutes &&
    currentTimeInMinutes < endTimeInMinutes
  );
}
