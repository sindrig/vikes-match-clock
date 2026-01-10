const pad = (x: number | string): string =>
  `${x}`.length < 2 ? pad(`0${x}`) : `${x}`;

export const formatTime = (mins: number, secs: number): string =>
  `${pad(mins)}:${pad(secs)}`;
export const formatMillisAsTime = (millis: number): string => {
  const seconds = millis / 1000;
  const displaySeconds = Math.max(Math.floor(seconds) % 60, 0);
  const displayMinutes = Math.max(Math.floor(seconds / 60), 0);
  return formatTime(displayMinutes, displaySeconds);
};
