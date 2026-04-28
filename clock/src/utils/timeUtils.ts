import moment from "moment";

const pad = (x: number | string): string =>
  `${x}`.length < 2 ? pad(`0${x}`) : `${x}`;

export const msUntilMatchStart = (matchStartTime: string): number | null => {
  const now = moment();
  const target = moment(matchStartTime, "HH:mm", true);
  if (!target.isValid()) return null;
  if (target <= now) target.add(1, "days");
  return target.valueOf() - now.valueOf();
};

export const formatTime = (mins: number, secs: number): string =>
  `${pad(mins)}:${pad(secs)}`;
export const formatMillisAsTime = (millis: number): string => {
  const seconds = millis / 1000;
  const displaySeconds = Math.max(Math.floor(seconds) % 60, 0);
  const displayMinutes = Math.max(Math.floor(seconds / 60), 0);
  return formatTime(displayMinutes, displaySeconds);
};
