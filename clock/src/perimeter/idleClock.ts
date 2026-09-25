import crestUrl from "../images/club-logos/Víkingur R.png";

export interface IdleClockPresentation {
  canvas: HTMLCanvasElement;
  draw: (elapsedMs: number, date: Date) => void;
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Atlantic/Reykjavik",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export const formatIdleTime = (date: Date): string =>
  timeFormatter.format(date);

// One pair per logical strip, wrapping at its own boundary every minute.
export function idleClockPosition(elapsedMs: number, width: number): number {
  return ((((elapsedMs % 60_000) + 60_000) % 60_000) / 60_000) * width;
}

export function composeIdleClock(
  screen: { width: number; height: number },
  crest: HTMLImageElement,
  canvas = document.createElement("canvas"),
): IdleClockPresentation {
  canvas.width = screen.width;
  canvas.height = screen.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Idle clock canvas is unavailable.");
  const fontSize = screen.height * 0.65;
  const font = `bold ${fontSize}px "GT America", sans-serif`;
  ctx.font = font;
  const crestHeight = screen.height * 0.84;
  const crestWidth = (crestHeight * crest.naturalWidth) / crest.naturalHeight;
  const gap = screen.height * 0.2;
  const textWidth = ctx.measureText("00:00").width;
  const pairWidth = crestWidth + gap + textWidth;
  const scale = Math.min(1, (screen.width * 0.9) / pairWidth);

  return {
    canvas,
    draw(elapsedMs, date) {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, screen.width, screen.height);
      const x = idleClockPosition(elapsedMs, screen.width);
      for (const origin of [x - screen.width, x]) {
        ctx.save();
        ctx.translate(origin, screen.height / 2);
        ctx.scale(scale, scale);
        ctx.drawImage(crest, 0, -crestHeight / 2, crestWidth, crestHeight);
        ctx.font = font;
        ctx.fillStyle = "white";
        ctx.textBaseline = "middle";
        ctx.fillText(formatIdleTime(date), crestWidth + gap, 0, textWidth);
        ctx.restore();
      }
    },
  };
}

export async function createIdleClocks(
  screens: readonly { id: string; width: number; height: number }[],
): Promise<Record<string, IdleClockPresentation>> {
  const crest = new Image();
  crest.src = crestUrl;
  await Promise.all([
    crest.decode(),
    document.fonts.load('bold 100px "GT America"'),
  ]);
  return Object.fromEntries(
    screens.map((screen) => [screen.id, composeIdleClock(screen, crest)]),
  );
}
