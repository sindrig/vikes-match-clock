/** Best-effort conversion of CSS colour strings to hex for the colour picker */
export function toHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const r = color[1];
    const g = color[2];
    const b = color[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const namedMap: Record<string, string> = {
    black: "#000000",
    white: "#ffffff",
    red: "#ff0000",
    transparent: "#000000",
  };
  const lower = color.toLowerCase().trim();
  const named = namedMap[lower];
  if (named) return named;

  const rgbMatch = lower.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1] ?? "0", 10)
      .toString(16)
      .padStart(2, "0");
    const g = parseInt(rgbMatch[2] ?? "0", 10)
      .toString(16)
      .padStart(2, "0");
    const b = parseInt(rgbMatch[3] ?? "0", 10)
      .toString(16)
      .padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  return "#000000";
}
