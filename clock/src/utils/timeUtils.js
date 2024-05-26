// eslint-disable-next-line
const pad = (x) => (`${x}`.length < 2 ? pad(`0${x}`) : x);

export const formatTime = (mins, secs) => `${pad(mins)}:${pad(secs)}`;
export const formatMillisAsTime = (millis) => {
  const seconds = millis / 1000;
  const displaySeconds = Math.max(Math.floor(seconds) % 60, 0);
  const displayMinutes = Math.max(Math.floor(seconds / 60), 0);
  return formatTime(displayMinutes, displaySeconds);
};
