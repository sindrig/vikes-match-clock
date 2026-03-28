/** Parsed representation of a `-webkit-text-stroke` CSS value */
export interface StrokeParts {
  width: number;
  color: string;
}

/** Parse a CSS `-webkit-text-stroke` value (e.g. "2px red") into width + colour */
export function parseStroke(value: string): StrokeParts {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "none") return { width: 0, color: "#000000" };

  // Match "<number>px <color>" — the colour part is everything after the px token
  const match = trimmed.match(/^([\d.]+)\s*px\s+(.+)$/);
  if (match) {
    const width = parseFloat(match[1] ?? "0");
    const color = match[2] ?? "#000000";
    return { width: Number.isNaN(width) ? 0 : width, color };
  }

  // Fallback: try to read just a number (bare width, default colour)
  const num = parseFloat(trimmed);
  if (!Number.isNaN(num)) return { width: num, color: "#000000" };

  return { width: 0, color: "#000000" };
}

/** Compose width + colour back into a `-webkit-text-stroke` CSS value */
export function composeStroke(width: number, color: string): string {
  if (width <= 0) return "none";
  return `${width}px ${color}`;
}

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

/** Parse a CSS font-size value (e.g. "2.5rem") into a numeric value and unit */
export function parseFontSize(value: string): { size: number; unit: string } {
  const match = value.trim().match(/^([\d.]+)\s*(.*)$/);
  if (match) {
    const size = parseFloat(match[1] ?? "0");
    const unit = match[2] || "rem";
    return { size: Number.isNaN(size) ? 1 : size, unit };
  }
  return { size: 1, unit: "rem" };
}

/** Compose a numeric size and unit back into a CSS font-size value */
export function composeFontSize(size: number, unit: string): string {
  return `${size}${unit}`;
}
